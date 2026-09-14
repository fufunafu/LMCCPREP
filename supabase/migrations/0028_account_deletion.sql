-- Self-serve account deletion (App Store guideline 5.1.1(v)).
-- Idempotent; safe to re-run.
--
-- delete_my_account() lets a signed-in user permanently delete their own
-- auth.users row. The function is SECURITY DEFINER and owned by the
-- migration role (postgres), which may delete from auth.users; every
-- user-owned table already reacts to that delete via its foreign key:
--   cascade:   profiles, sessions, attempts, flags, notes,
--              billing_customers, billing_subscriptions,
--              billing_access_grants, coaching_bookings
--   set null:  question_edits.user_id, questions.created_by,
--              coaching_tutors.user_id (tutor profile detaches)
-- Rows in stripe_webhook_events are event logs keyed by Stripe ids, not
-- user ids, and are retained. Stripe-side customer/subscription records
-- are not touched: subscriptions must be cancelled separately, which the
-- app's confirmation copy states.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
