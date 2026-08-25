-- Let reconciliation repair stale active access without extending a failed-payment grace period.

create or replace function sync_billing_subscription(
  p_stripe_subscription_id text,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_price_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_access_until timestamptz,
  p_cancel_at_period_end boolean,
  p_trial_end timestamptz,
  p_event_created_at timestamptz,
  p_payment_event text,
  p_is_reconciliation boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if p_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  ) then
    raise exception 'Unsupported Stripe subscription status';
  end if;

  if p_payment_event is not null and p_payment_event not in ('paid', 'failed') then
    raise exception 'Unsupported Stripe payment event';
  end if;

  insert into billing_subscriptions (
    stripe_subscription_id,
    user_id,
    stripe_customer_id,
    stripe_price_id,
    status,
    current_period_end,
    access_until,
    cancel_at_period_end,
    trial_end,
    payment_failed_at,
    latest_payment_event,
    latest_event_created_at,
    updated_at
  ) values (
    p_stripe_subscription_id,
    p_user_id,
    p_stripe_customer_id,
    p_stripe_price_id,
    p_status,
    p_current_period_end,
    p_access_until,
    p_cancel_at_period_end,
    p_trial_end,
    case when p_payment_event = 'failed' then p_event_created_at else null end,
    p_payment_event,
    p_event_created_at,
    now()
  )
  on conflict (stripe_subscription_id) do update set
    user_id = excluded.user_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    access_until = case
      when p_is_reconciliation and excluded.status in ('active', 'trialing')
        then excluded.access_until
      when excluded.status in ('incomplete', 'incomplete_expired', 'unpaid', 'paused')
        then excluded.access_until
      when p_payment_event = 'paid'
        then excluded.access_until
      when p_payment_event = 'failed'
        and billing_subscriptions.payment_failed_at is not null
        then least(billing_subscriptions.access_until, excluded.access_until)
      when p_payment_event = 'failed'
        then excluded.access_until
      when billing_subscriptions.payment_failed_at is not null
        then least(billing_subscriptions.access_until, excluded.access_until)
      when billing_subscriptions.status = 'past_due'
        and excluded.status = 'past_due'
        then least(billing_subscriptions.access_until, excluded.access_until)
      else excluded.access_until
    end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    trial_end = excluded.trial_end,
    payment_failed_at = case
      when p_is_reconciliation and excluded.status in ('active', 'trialing') then null
      when p_payment_event = 'paid' then null
      when p_payment_event = 'failed' then coalesce(billing_subscriptions.payment_failed_at, p_event_created_at)
      else billing_subscriptions.payment_failed_at
    end,
    latest_payment_event = coalesce(p_payment_event, billing_subscriptions.latest_payment_event),
    latest_event_created_at = excluded.latest_event_created_at,
    updated_at = now()
  where p_is_reconciliation
    or excluded.latest_event_created_at > billing_subscriptions.latest_event_created_at
    or (
      excluded.latest_event_created_at = billing_subscriptions.latest_event_created_at
      and not (
        coalesce(p_payment_event = 'failed', false)
        and coalesce(billing_subscriptions.latest_payment_event = 'paid', false)
      )
    )
  returning true into v_changed;

  return coalesce(v_changed, false);
end;
$$;

revoke all on function sync_billing_subscription(
  text, uuid, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean
) from public;
grant execute on function sync_billing_subscription(
  text, uuid, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean
) to service_role;

-- Atomically record and claim a webhook event. A five-minute lease lets Stripe
-- retries recover an event if a worker stops before recording an outcome.
create or replace function claim_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_event_created_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event stripe_webhook_events%rowtype;
  v_inserted int;
begin
  insert into stripe_webhook_events (
    stripe_event_id,
    event_type,
    event_created_at,
    received_at
  ) values (
    p_stripe_event_id,
    p_event_type,
    p_event_created_at,
    now()
  )
  on conflict (stripe_event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return 'claimed';
  end if;

  select *
  into v_event
  from stripe_webhook_events
  where stripe_event_id = p_stripe_event_id
  for update;

  if not found then
    raise exception 'Stripe event claim disappeared';
  end if;

  if v_event.event_type <> p_event_type
    or v_event.event_created_at <> p_event_created_at then
    raise exception 'Stripe event identity mismatch';
  end if;

  if v_event.processed_at is not null then
    return 'processed';
  end if;

  if v_event.processing_error is null
    and v_event.received_at > now() - interval '5 minutes' then
    return 'processing';
  end if;

  update stripe_webhook_events
  set received_at = now(), processing_error = null
  where stripe_event_id = p_stripe_event_id;

  return 'claimed';
end;
$$;

revoke all on function claim_stripe_webhook_event(text, text, timestamptz) from public;
grant execute on function claim_stripe_webhook_event(text, text, timestamptz) to service_role;
