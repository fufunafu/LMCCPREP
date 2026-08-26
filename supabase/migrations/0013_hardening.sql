-- Hardening pass over the schema introduced in 0001-0012. Idempotent; safe to re-run.
--
-- What this changes:
--   1. next_user_question_qid(): service-role-only wrapper around the
--      user_question_qid sequence, and advances the sequence past any
--      capture-route rows already stored with qid >= 1000000.
--   2. Every RLS policy from 0009 that calls has_billing_access() is recreated
--      with the call wrapped as (select has_billing_access()) so Postgres
--      evaluates it once per statement (InitPlan) instead of once per row.
--   3. questions SELECT hides other users' user-authored questions;
--      get_public_subject_counts() excludes user-authored questions.
--   4. topics INSERT is restricted to entitled users creating a well-formed
--      id (subject_id || '/' || slug(name), matching add_user_question), with
--      a 2-80 character name and an existing subject.
--   5. questions UPDATE keeps qid >= 1000000 for user-authored rows.
--   6. attempts INSERT bounds time_ms to 0..3600000.
--   7. The normalized-stem unique index becomes partial (source <> 'user')
--      so user-authored near-duplicates do not fail; pick_questions gains
--      set search_path = public.
--   8. EXECUTE on pick_questions, add_user_question, normalize_question_tags,
--      question_task_tag and set_question_tags is revoked from public/anon
--      and granted to authenticated and service_role. Future functions no
--      longer receive EXECUTE for public by default.
--   9. sessions.current_index is clamped to the last valid question index.
--  10. Supporting indexes on attempts(session_id), attempts(qid),
--      question_edits(qid), questions(created_by), questions(source).
--  11. access_requests gains email/message length and format constraints.
--  12. question_edits.client_id (uuid, unique when set) for idempotent
--      inserts from offline clients.

-- ---------- 1. sequence access for the service role ----------
create or replace function next_user_question_qid()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('user_question_qid');
$$;

revoke all on function next_user_question_qid() from public;
revoke all on function next_user_question_qid() from anon;
revoke all on function next_user_question_qid() from authenticated;
grant execute on function next_user_question_qid() to service_role;

select setval(
  'user_question_qid',
  greatest(
    1000000,
    coalesce((select max(qid) from questions where qid >= 1000000), 1000000)
  )
);

-- ---------- 2. + 3. + 4. + 5. + 6. entitlement policies (InitPlan form) ----------
drop policy if exists "content readable by entitled users" on subjects;
create policy "content readable by entitled users" on subjects
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "content readable by entitled users" on topics;
create policy "content readable by entitled users" on topics
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "content readable by entitled users" on questions;
create policy "content readable by entitled users" on questions
  for select to authenticated
  using (
    (select has_billing_access())
    and (source <> 'user' or created_by = auth.uid())
  );

drop policy if exists "recalls readable by entitled users" on recalls;
create policy "recalls readable by entitled users" on recalls
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank categories readable by entitled users" on qbank_categories;
create policy "qbank categories readable by entitled users" on qbank_categories
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank memberships readable by entitled users" on qbank_question_categories;
create policy "qbank memberships readable by entitled users" on qbank_question_categories
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank subjects readable by entitled users" on qbank_subjects;
create policy "qbank subjects readable by entitled users" on qbank_subjects
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank topics readable by entitled users" on qbank_topics;
create policy "qbank topics readable by entitled users" on qbank_topics
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank question topics readable by entitled users" on qbank_question_topics;
create policy "qbank question topics readable by entitled users" on qbank_question_topics
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "qbank images readable by entitled users" on qbank_question_images;
create policy "qbank images readable by entitled users" on qbank_question_images
  for select to authenticated using ((select has_billing_access()));

drop policy if exists "entitled users can read private qbank image objects" on storage.objects;
create policy "entitled users can read private qbank image objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'qbank-images' and (select has_billing_access()));

drop policy if exists "read own sessions while entitled" on sessions;
create policy "read own sessions while entitled" on sessions for select to authenticated
  using (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "insert own sessions while entitled" on sessions;
create policy "insert own sessions while entitled" on sessions for insert to authenticated
  with check (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "update own sessions while entitled" on sessions;
create policy "update own sessions while entitled" on sessions for update to authenticated
  using (user_id = auth.uid() and (select has_billing_access()))
  with check (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "delete own sessions while entitled" on sessions;
create policy "delete own sessions while entitled" on sessions for delete to authenticated
  using (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "read own attempts while entitled" on attempts;
create policy "read own attempts while entitled" on attempts for select to authenticated
  using (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "insert valid own attempts while entitled" on attempts;
create policy "insert valid own attempts while entitled" on attempts for insert to authenticated
  with check (
    user_id = auth.uid()
    and (select has_billing_access())
    and time_ms between 0 and 3600000
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

drop policy if exists "delete own attempts while entitled" on attempts;
create policy "delete own attempts while entitled" on attempts for delete to authenticated
  using (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "own flags while entitled" on flags;
create policy "own flags while entitled" on flags for all to authenticated
  using (user_id = auth.uid() and (select has_billing_access()))
  with check (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "own notes while entitled" on notes;
create policy "own notes while entitled" on notes for all to authenticated
  using (user_id = auth.uid() and (select has_billing_access()))
  with check (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "submit edits while entitled" on question_edits;
create policy "submit edits while entitled" on question_edits for insert to authenticated
  with check (user_id = auth.uid() and (select has_billing_access()));

drop policy if exists "entitled authors can insert own questions" on questions;
create policy "entitled authors can insert own questions" on questions
  for insert to authenticated
  with check (
    (select has_billing_access())
    and source = 'user'
    and created_by = auth.uid()
    and qid >= 1000000
  );

drop policy if exists "entitled authors can edit own questions" on questions;
create policy "entitled authors can edit own questions" on questions
  for update to authenticated
  using ((select has_billing_access()) and source = 'user' and created_by = auth.uid())
  with check (
    (select has_billing_access())
    and source = 'user'
    and created_by = auth.uid()
    and qid >= 1000000
  );

drop policy if exists "entitled authors can delete own questions" on questions;
create policy "entitled authors can delete own questions" on questions
  for delete to authenticated
  using ((select has_billing_access()) and source = 'user' and created_by = auth.uid());

-- Topic ids must match how add_user_question (0012) derives them:
--   p_subject_id || '/' || regexp_replace(lower(p_topic_name), '[^a-z0-9]+', '-', 'g')
drop policy if exists "entitled authors can add topics" on topics;
create policy "entitled authors can add topics" on topics for insert to authenticated
  with check (
    (select has_billing_access())
    and char_length(name) between 2 and 80
    and id = subject_id || '/' || regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
    and exists (select 1 from subjects s where s.id = subject_id)
  );

-- ---------- 3. public counts exclude user-authored questions ----------
create or replace function get_public_subject_counts()
returns table(id text, name text, question_count int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, count(q.qid)::int
  from subjects s
  left join questions q on q.subject_id = s.id and q.source <> 'user'
  where s.id = any(array['medicine', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_public_subject_counts() from public;
grant execute on function get_public_subject_counts() to anon, authenticated;

-- ---------- 7. partial stem uniqueness + pick_questions search_path ----------
drop index if exists questions_normalized_stem_unique_idx;
create unique index if not exists questions_normalized_stem_unique_idx
  on questions ((regexp_replace(lower(stem), '[^a-z0-9]+', '', 'g')))
  where source <> 'user';

create or replace function pick_questions(
  p_subjects text[], p_topics text[], p_status text, p_limit int
) returns setof int
language sql
security invoker
stable
set search_path = public
as $$
  select q.qid from questions q
  left join user_question_status s on s.qid = q.qid and s.user_id = auth.uid()
  left join flags f on f.qid = q.qid and f.user_id = auth.uid()
  where (p_subjects is null or q.subject_id = any(p_subjects))
    and (p_topics   is null or q.topic_id   = any(p_topics))
    and case p_status
          when 'unused'    then s.qid is null
          when 'incorrect' then s.last_correct = false
          when 'flagged'   then f.qid is not null
          else true end
  order by random() limit p_limit;
$$;

-- ---------- 8. function execute privileges ----------
revoke all on function pick_questions(text[], text[], text, int) from public;
revoke all on function pick_questions(text[], text[], text, int) from anon;
grant execute on function pick_questions(text[], text[], text, int) to authenticated, service_role;

revoke all on function add_user_question(text, text, text, jsonb, int, jsonb, text[]) from public;
revoke all on function add_user_question(text, text, text, jsonb, int, jsonb, text[]) from anon;
grant execute on function add_user_question(text, text, text, jsonb, int, jsonb, text[]) to authenticated, service_role;

revoke all on function normalize_question_tags(text[]) from public;
revoke all on function normalize_question_tags(text[]) from anon;
grant execute on function normalize_question_tags(text[]) to authenticated, service_role;

revoke all on function question_task_tag(text) from public;
revoke all on function question_task_tag(text) from anon;
grant execute on function question_task_tag(text) to authenticated, service_role;

revoke all on function set_question_tags() from public;
revoke all on function set_question_tags() from anon;
grant execute on function set_question_tags() to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;

-- ---------- 9. clamp session cursors ----------
update sessions
set current_index = least(current_index, greatest(cardinality(question_ids) - 1, 0))
where current_index > cardinality(question_ids) - 1;

-- ---------- 10. indexes ----------
create index if not exists attempts_session_idx on attempts(session_id);
create index if not exists attempts_qid_idx on attempts(qid);
create index if not exists question_edits_qid_idx on question_edits(qid);
create index if not exists questions_created_by_idx on questions(created_by) where created_by is not null;
create index if not exists questions_source_idx on questions(source);

-- ---------- 11. access_requests input bounds ----------
-- Constraints are added NOT VALID so new rows are checked immediately, then
-- validated against existing rows. If historical rows violate a constraint the
-- validation is skipped with a warning and the constraint stays NOT VALID.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'access_requests_email_check'
      and conrelid = 'public.access_requests'::regclass
  ) then
    alter table access_requests
      add constraint access_requests_email_check
      check (
        char_length(email) <= 254
        and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'access_requests_message_check'
      and conrelid = 'public.access_requests'::regclass
  ) then
    alter table access_requests
      add constraint access_requests_message_check
      check (message is null or char_length(message) <= 4000) not valid;
  end if;

  begin
    alter table access_requests validate constraint access_requests_email_check;
  exception when check_violation then
    raise warning 'access_requests_email_check left NOT VALID: existing rows violate it';
  end;

  begin
    alter table access_requests validate constraint access_requests_message_check;
  exception when check_violation then
    raise warning 'access_requests_message_check left NOT VALID: existing rows violate it';
  end;
end
$$;

-- ---------- 12. idempotent question_edits from offline clients ----------
-- Clients (iOS outbox) attach a UUID at enqueue time so a retried insert after
-- a lost response cannot create a duplicate report. Nullable so web inserts
-- without a client id keep working.
alter table question_edits add column if not exists client_id uuid;
create unique index if not exists question_edits_client_id_key
  on question_edits (client_id) where client_id is not null;
