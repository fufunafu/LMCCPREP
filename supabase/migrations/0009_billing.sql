-- Stripe billing, durable entitlements, idempotent events, and paid-content RLS.

create table if not exists billing_settings (
  id                boolean primary key default true check (id),
  billing_required  boolean not null default false,
  grace_days        int not null default 3 check (grace_days between 0 and 30),
  updated_at        timestamptz not null default now()
);

insert into billing_settings(id, billing_required, grace_days)
values (true, false, 3)
on conflict (id) do nothing;

create table if not exists billing_customers (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text unique not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  stripe_subscription_id   text primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id       text not null,
  stripe_price_id          text not null,
  status                   text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  )),
  current_period_end       timestamptz,
  access_until             timestamptz,
  cancel_at_period_end     boolean not null default false,
  trial_end                timestamptz,
  payment_failed_at        timestamptz,
  latest_payment_event     text check (latest_payment_event in ('paid', 'failed')),
  latest_event_created_at  timestamptz not null default to_timestamp(0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists billing_access_grants (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  reason      text not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists stripe_webhook_events (
  stripe_event_id  text primary key,
  event_type       text not null,
  event_created_at timestamptz not null,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  processing_error text
);

create index if not exists billing_customers_stripe_customer_idx
  on billing_customers(stripe_customer_id);
create index if not exists billing_subscriptions_user_idx
  on billing_subscriptions(user_id);
create index if not exists billing_subscriptions_customer_idx
  on billing_subscriptions(stripe_customer_id);
create index if not exists billing_subscriptions_status_access_idx
  on billing_subscriptions(status, access_until);
create index if not exists billing_subscriptions_period_end_idx
  on billing_subscriptions(current_period_end);

alter table billing_settings enable row level security;
alter table billing_customers enable row level security;
alter table billing_subscriptions enable row level security;
alter table billing_access_grants enable row level security;
alter table stripe_webhook_events enable row level security;

drop policy if exists "read own billing customer" on billing_customers;
create policy "read own billing customer"
  on billing_customers for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read own billing subscriptions" on billing_subscriptions;
create policy "read own billing subscriptions"
  on billing_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read own billing grants" on billing_access_grants;
create policy "read own billing grants"
  on billing_access_grants for select to authenticated
  using (user_id = auth.uid());

create or replace function has_billing_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce(
      (select billing_required from billing_settings where id = true),
      false
    )
    or exists (
      select 1
      from billing_access_grants g
      where g.user_id = auth.uid()
        and (g.expires_at is null or g.expires_at > now())
    )
    or exists (
      select 1
      from billing_subscriptions s
      where s.user_id = auth.uid()
        and s.status in ('active', 'trialing', 'past_due', 'canceled')
        and s.access_until > now()
    );
$$;

revoke all on function has_billing_access() from public;
grant execute on function has_billing_access() to authenticated;

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
    case when p_is_reconciliation then to_timestamp(0) else p_event_created_at end,
    now()
  )
  on conflict (stripe_subscription_id) do update set
    user_id = excluded.user_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    access_until = case
      when excluded.status in ('incomplete', 'incomplete_expired', 'unpaid', 'paused')
        then excluded.access_until
      when p_payment_event in ('paid', 'failed')
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
      when p_payment_event = 'paid' then null
      when p_payment_event = 'failed' then coalesce(billing_subscriptions.payment_failed_at, p_event_created_at)
      else billing_subscriptions.payment_failed_at
    end,
    latest_payment_event = coalesce(p_payment_event, billing_subscriptions.latest_payment_event),
    latest_event_created_at = case
      when p_is_reconciliation then billing_subscriptions.latest_event_created_at
      else excluded.latest_event_created_at
    end,
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

-- Replace broad authenticated content access with billing-aware access.
drop policy if exists "content readable by signed-in users" on subjects;
drop policy if exists "content readable by signed-in users" on topics;
drop policy if exists "content readable by signed-in users" on questions;
create policy "content readable by entitled users" on subjects
  for select to authenticated using (has_billing_access());
create policy "content readable by entitled users" on topics
  for select to authenticated using (has_billing_access());
create policy "content readable by entitled users" on questions
  for select to authenticated using (has_billing_access());

drop policy if exists "recalls readable by signed-in users" on recalls;
create policy "recalls readable by entitled users" on recalls
  for select to authenticated using (has_billing_access());

drop policy if exists "qbank categories readable by signed-in users" on qbank_categories;
drop policy if exists "qbank memberships readable by signed-in users" on qbank_question_categories;
drop policy if exists "qbank subjects readable by signed-in users" on qbank_subjects;
drop policy if exists "qbank topics readable by signed-in users" on qbank_topics;
drop policy if exists "qbank question topics readable by signed-in users" on qbank_question_topics;
drop policy if exists "qbank images readable by signed-in users" on qbank_question_images;
create policy "qbank categories readable by entitled users" on qbank_categories
  for select to authenticated using (has_billing_access());
create policy "qbank memberships readable by entitled users" on qbank_question_categories
  for select to authenticated using (has_billing_access());
create policy "qbank subjects readable by entitled users" on qbank_subjects
  for select to authenticated using (has_billing_access());
create policy "qbank topics readable by entitled users" on qbank_topics
  for select to authenticated using (has_billing_access());
create policy "qbank question topics readable by entitled users" on qbank_question_topics
  for select to authenticated using (has_billing_access());
create policy "qbank images readable by entitled users" on qbank_question_images
  for select to authenticated using (has_billing_access());

drop policy if exists "authenticated users can read private qbank image objects" on storage.objects;
create policy "entitled users can read private qbank image objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'qbank-images' and has_billing_access());

-- Enforce entitlement for user-created and per-user paid data.
drop policy if exists "own sessions" on sessions;
create policy "read own sessions while entitled" on sessions for select to authenticated
  using (user_id = auth.uid() and has_billing_access());
create policy "insert own sessions while entitled" on sessions for insert to authenticated
  with check (user_id = auth.uid() and has_billing_access());
create policy "update own sessions while entitled" on sessions for update to authenticated
  using (user_id = auth.uid() and has_billing_access())
  with check (user_id = auth.uid() and has_billing_access());
create policy "delete own sessions while entitled" on sessions for delete to authenticated
  using (user_id = auth.uid() and has_billing_access());

drop policy if exists "read own attempts" on attempts;
drop policy if exists "insert valid own attempts" on attempts;
drop policy if exists "delete own attempts" on attempts;
create policy "read own attempts while entitled" on attempts for select to authenticated
  using (user_id = auth.uid() and has_billing_access());
create policy "insert valid own attempts while entitled" on attempts for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_billing_access()
    and exists (
      select 1 from sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
        and qid = any(s.question_ids)
    )
    and correct = coalesce(
      chosen_index = (select q.answer_index from questions q where q.qid = attempts.qid),
      false
    )
  );
create policy "delete own attempts while entitled" on attempts for delete to authenticated
  using (user_id = auth.uid() and has_billing_access());

drop policy if exists "own flags" on flags;
create policy "own flags while entitled" on flags for all to authenticated
  using (user_id = auth.uid() and has_billing_access())
  with check (user_id = auth.uid() and has_billing_access());

drop policy if exists "own notes" on notes;
create policy "own notes while entitled" on notes for all to authenticated
  using (user_id = auth.uid() and has_billing_access())
  with check (user_id = auth.uid() and has_billing_access());

drop policy if exists "submit edits" on question_edits;
create policy "submit edits while entitled" on question_edits for insert to authenticated
  with check (user_id = auth.uid() and has_billing_access());

drop policy if exists "authors can insert own questions" on questions;
drop policy if exists "authors can edit own questions" on questions;
drop policy if exists "authors can delete own questions" on questions;
create policy "entitled authors can insert own questions" on questions
  for insert to authenticated
  with check (
    has_billing_access()
    and source = 'user'
    and created_by = auth.uid()
    and qid >= 1000000
  );
create policy "entitled authors can edit own questions" on questions
  for update to authenticated
  using (has_billing_access() and source = 'user' and created_by = auth.uid())
  with check (has_billing_access() and source = 'user' and created_by = auth.uid());
create policy "entitled authors can delete own questions" on questions
  for delete to authenticated
  using (has_billing_access() and source = 'user' and created_by = auth.uid());

drop policy if exists "authors can add topics" on topics;
create policy "entitled authors can add topics" on topics for insert to authenticated
  with check (has_billing_access());
