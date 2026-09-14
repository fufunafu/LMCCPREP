-- Null means the learner has not answered the initial planning question.
-- Unknown is an explicit answer, so it must not trigger repeated onboarding.
alter table public.profiles
  add column if not exists exam_date_precision text
  check (exam_date_precision in ('exact', 'approximate', 'unknown'));

update public.profiles set exam_date_precision = 'exact'
where target_exam_date is not null and exam_date_precision is null;

alter table public.profiles add constraint profiles_exam_date_consistent check (coalesce(
  (exam_date_precision is null and target_exam_date is null)
  or (exam_date_precision = 'unknown' and target_exam_date is null)
  or (exam_date_precision in ('exact', 'approximate') and target_exam_date is not null)
, false));
