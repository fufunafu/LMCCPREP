-- Legacy prices were MCCQE plans. USMLE prices carry a separate exam assignment.
alter table public.billing_subscriptions
  add column if not exists exam_id text not null default 'mccqe' references public.exams(id);

-- The subscription takes precedence over any historical learner preference.
create or replace function public.current_exam_id()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select s.exam_id from billing_subscriptions s
     where s.user_id = auth.uid()
       and s.status in ('active', 'trialing', 'past_due', 'canceled')
       and s.access_until > now()
     order by s.access_until desc, s.latest_event_created_at desc, s.stripe_subscription_id
     limit 1),
    (select p.exam_id from profiles p where p.id = auth.uid()),
    'mccqe'
  );
$$;
revoke all on function public.current_exam_id() from public;
grant execute on function public.current_exam_id() to authenticated, service_role;

-- Keep existing event ordering, payment recovery and grace-period behavior.
-- This overload adds the exam from the server's trusted Stripe-price mapping.
create or replace function public.sync_billing_subscription(
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
  p_is_reconciliation boolean,
  p_exam_id text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_changed boolean;
begin
  if p_exam_id is null or p_exam_id not in ('mccqe', 'usmle') then
    raise exception 'A subscription must cover exactly one supported exam';
  end if;
  v_changed := sync_billing_subscription(
    p_stripe_subscription_id, p_user_id, p_stripe_customer_id, p_stripe_price_id,
    p_status, p_current_period_end, p_access_until, p_cancel_at_period_end,
    p_trial_end, p_event_created_at, p_payment_event, p_is_reconciliation
  );
  if v_changed then
    update billing_subscriptions set exam_id = p_exam_id
    where stripe_subscription_id = p_stripe_subscription_id;

    -- Native clients also read profiles.exam_id. Keep it aligned atomically.
    update profiles p set exam_id = s.exam_id
    from (
      select exam_id from billing_subscriptions
      where user_id = p_user_id
        and status in ('active', 'trialing', 'past_due', 'canceled')
        and access_until > now()
      order by access_until desc, latest_event_created_at desc, stripe_subscription_id
      limit 1
    ) s
    where p.id = p_user_id;
  end if;
  return v_changed;
end;
$$;
revoke all on function public.sync_billing_subscription(
  text, uuid, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, text, boolean, text
) from public;
grant execute on function public.sync_billing_subscription(
  text, uuid, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, text, boolean, text
) to service_role;

update profiles p set exam_id = s.exam_id
from (
  select distinct on (user_id) user_id, exam_id
  from billing_subscriptions
  where status in ('active', 'trialing', 'past_due', 'canceled') and access_until > now()
  order by user_id, access_until desc, latest_event_created_at desc, stripe_subscription_id
) s where p.id = s.user_id;

-- RLS alone on profiles would still allow learners to alter their own exam.
create or replace function public.protect_profile_exam()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'UPDATE' then
      if new.exam_id is distinct from old.exam_id then
        raise exception 'Question-bank access is managed by your subscription';
      end if;
    else
      -- BEFORE INSERT also runs for profile upserts. Replace the column default
      -- with the assigned exam so a USMLE learner can save ordinary preferences.
      new.exam_id := current_exam_id();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_exam() from public;
create trigger protect_profile_exam before insert or update on public.profiles
for each row execute function public.protect_profile_exam();

-- Account deletion remains available through the dedicated security-definer RPC.
create policy "profile deletion requires account deletion" on public.profiles
as restrictive for delete to authenticated using (false);

-- Restrictive policies combine with existing rights, readiness and billing gates.
create policy "subjects limited to assigned exam" on public.subjects
as restrictive for all to authenticated
using (exam_id = (select current_exam_id()))
with check (exam_id = (select current_exam_id()));

create policy "topics limited to assigned exam" on public.topics
as restrictive for all to authenticated
using (exists (select 1 from subjects s where s.id = subject_id))
with check (exists (select 1 from subjects s where s.id = subject_id));

create policy "questions limited to assigned exam" on public.questions
as restrictive for all to authenticated
using (exists (select 1 from subjects s where s.id = subject_id))
with check (exists (select 1 from subjects s where s.id = subject_id));

-- Activity and status views inherit this scope, keeping daily pacing and stats
-- independent of any historical practice in the other bank.
create policy "attempts limited to assigned exam" on public.attempts
as restrictive for all to authenticated
using (exists (select 1 from questions q where q.qid = attempts.qid))
with check (exists (select 1 from questions q where q.qid = attempts.qid));

-- Image and taxonomy lookups must not reveal the other bank through a direct API call.
create policy "images limited to assigned exam" on public.qbank_question_images
as restrictive for select to authenticated
using (exists (select 1 from questions q where q.qid = qbank_question_images.qid));

create policy "question categories limited to assigned exam" on public.qbank_question_categories
as restrictive for select to authenticated
using (exists (select 1 from questions q where q.qid = qbank_question_categories.qid));

create policy "question topics limited to assigned exam" on public.qbank_question_topics
as restrictive for select to authenticated
using (exists (select 1 from questions q where q.qid = qbank_question_topics.qid));

-- Recalls are a legacy MCCQE-only resource.
create policy "recalls limited to MCCQE" on public.recalls
as restrictive for select to authenticated
using ((select current_exam_id()) = 'mccqe');

create policy "private bank images limited to assigned exam" on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'qbank-images'
  or exists (
    select 1 from qbank_question_images qi where qi.storage_path = storage.objects.name
  )
);
