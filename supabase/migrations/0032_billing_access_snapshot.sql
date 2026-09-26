-- Native clients cache an expiring authorization, never an indefinite boolean.
create or replace function public.billing_access_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allowed', has_billing_access(),
    'exam_id', current_exam_id(),
    'valid_until', least(now() + interval '72 hours', coalesce(
      (select max(valid_until) from (
        select now() + interval '72 hours' as valid_until
          where not coalesce((select billing_required from billing_settings where id), false)
        union all select coalesce(expires_at, now() + interval '72 hours') from billing_access_grants
          where user_id = auth.uid() and (expires_at is null or expires_at > now())
        union all select access_until from billing_subscriptions where user_id = auth.uid()
          and status in ('active','trialing','past_due','canceled') and access_until > now()
        union all select access_until from apple_current_subscriptions where user_id = auth.uid()
          and not revoked and access_until > now()
      ) access_periods), now()))
  );
$$;
revoke all on function public.billing_access_snapshot() from public;
grant execute on function public.billing_access_snapshot() to authenticated;
