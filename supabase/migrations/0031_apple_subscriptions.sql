-- Verified Apple purchases are independent of Stripe and complimentary grants.
-- Tombstones retain purchase ownership after account deletion, without user data.
create table public.apple_subscription_accounts (
  environment text not null check (environment in ('Production', 'Sandbox')),
  original_transaction_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  primary key (environment, original_transaction_id)
);
create table public.apple_subscription_transactions (
  environment text not null,
  original_transaction_id text not null,
  transaction_id text not null,
  product_id text not null,
  exam_id text not null references public.exams(id),
  expires_at timestamptz not null,
  access_until timestamptz not null,
  signed_at timestamptz not null,
  purchase_at timestamptz not null,
  revoked boolean not null default false,
  auto_renew boolean not null default false,
  primary key (environment, transaction_id),
  foreign key (environment, original_transaction_id)
    references public.apple_subscription_accounts(environment, original_transaction_id)
);
create index apple_subscription_accounts_user_idx on public.apple_subscription_accounts(user_id);
create index apple_subscription_transactions_original_idx on public.apple_subscription_transactions(environment, original_transaction_id);
alter table public.apple_subscription_accounts enable row level security;
alter table public.apple_subscription_transactions enable row level security;
revoke all on public.apple_subscription_accounts, public.apple_subscription_transactions from anon, authenticated;
grant all on public.apple_subscription_accounts, public.apple_subscription_transactions to service_role;

-- A late refund for an earlier period cannot revoke a later paid renewal, and
-- an older unexpired receipt cannot outlive the latest expired subscription.
create view public.apple_current_subscriptions with (security_invoker = true) as
select distinct on (t.environment, t.original_transaction_id)
  t.*, a.user_id
from public.apple_subscription_accounts a join public.apple_subscription_transactions t
  using (environment, original_transaction_id)
order by t.environment, t.original_transaction_id, t.purchase_at desc, t.signed_at desc, t.transaction_id desc;
revoke all on public.apple_current_subscriptions from anon, authenticated;
grant select on public.apple_current_subscriptions to service_role;

create or replace function public.has_billing_access()
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select billing_required from billing_settings where id), false)
    or exists (select 1 from billing_access_grants where user_id = auth.uid() and (expires_at is null or expires_at > now()))
    or exists (select 1 from billing_subscriptions where user_id = auth.uid()
      and status in ('active','trialing','past_due','canceled') and access_until > now())
    or exists (select 1 from apple_current_subscriptions t
      where t.user_id = auth.uid() and not t.revoked and t.access_until > now());
$$;
revoke all on function public.has_billing_access() from public;
grant execute on function public.has_billing_access() to authenticated;

-- Existing Stripe access retains precedence while both subscriptions are active.
create or replace function public.current_exam_id()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select exam_id from billing_subscriptions where user_id = auth.uid()
      and status in ('active','trialing','past_due','canceled') and access_until > now()
      order by access_until desc, latest_event_created_at desc, stripe_subscription_id limit 1),
    (select t.exam_id from apple_current_subscriptions t
      where t.user_id = auth.uid() and not t.revoked and t.access_until > now()
      order by (t.environment = 'Production') desc, t.purchase_at desc, t.signed_at desc, t.transaction_id desc limit 1),
    (select exam_id from profiles where id = auth.uid()), 'mccqe');
$$;
revoke all on function public.current_exam_id() from public;
grant execute on function public.current_exam_id() to authenticated, service_role;

create function public.sync_apple_subscription(
  p_environment text, p_original_transaction_id text, p_transaction_id text,
  p_user_id uuid, p_product_id text, p_exam_id text, p_expires_at timestamptz,
  p_access_until timestamptz, p_signed_at timestamptz, p_purchase_at timestamptz,
  p_revoked boolean, p_auto_renew boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare owner_id uuid; changed int;
begin
  if p_exam_id not in ('mccqe', 'usmle') or p_product_id not in (
    'ca.lmccprep.app.' || p_exam_id || '.monthly',
    'ca.lmccprep.app.' || p_exam_id || '.quarterly',
    'ca.lmccprep.app.' || p_exam_id || '.annual'
  ) then raise exception 'Unknown Apple product'; end if;
  insert into apple_subscription_accounts values (p_environment, p_original_transaction_id, p_user_id)
    on conflict do nothing;
  select user_id into owner_id from apple_subscription_accounts
    where environment = p_environment and original_transaction_id = p_original_transaction_id for update;
  if owner_id is distinct from p_user_id or owner_id is null then
    raise exception 'Apple subscription already belongs to another account';
  end if;
  insert into apple_subscription_transactions as old values (
    p_environment, p_original_transaction_id, p_transaction_id, p_product_id, p_exam_id,
    p_expires_at, p_access_until, p_signed_at, p_purchase_at, p_revoked, p_auto_renew
  ) on conflict (environment, transaction_id) do update set
    expires_at = excluded.expires_at, access_until = excluded.access_until,
    signed_at = excluded.signed_at, revoked = excluded.revoked, auto_renew = excluded.auto_renew
  where old.original_transaction_id = excluded.original_transaction_id
    and excluded.signed_at > old.signed_at;
  get diagnostics changed = row_count;
  -- Mirror the authoritative exam selection for native profile readers.
  update profiles set exam_id = coalesce(
    (select s.exam_id from billing_subscriptions s where s.user_id = p_user_id
      and s.status in ('active','trialing','past_due','canceled') and s.access_until > now()
      order by s.access_until desc, s.latest_event_created_at desc, s.stripe_subscription_id limit 1),
    (select t.exam_id from apple_current_subscriptions t where t.user_id = p_user_id
      and not t.revoked and t.access_until > now()
      order by (t.environment = 'Production') desc, t.purchase_at desc, t.signed_at desc, t.transaction_id desc limit 1), exam_id)
    where id = p_user_id;
  return changed > 0;
end;
$$;
revoke all on function public.sync_apple_subscription(text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,boolean) from public;
grant execute on function public.sync_apple_subscription(text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,boolean) to service_role;
