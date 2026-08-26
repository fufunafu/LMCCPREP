-- Fail closed for distributable bank content and expose safe editorial metadata.

alter table questions
  add column if not exists distribution_rights_status text not null default 'unverified',
  add column if not exists distribution_rights_note text,
  add column if not exists editorial_status text not null default 'pending',
  add column if not exists last_reviewed_at date,
  add column if not exists reviewer_role text,
  add column if not exists reference_exception text;

alter table questions drop constraint if exists questions_distribution_rights_status_check;
alter table questions add constraint questions_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'unverified', 'quarantined'));

alter table questions drop constraint if exists questions_editorial_status_check;
alter table questions add constraint questions_editorial_status_check
  check (editorial_status in ('pending', 'reviewed', 'stale', 'personal'));

update questions
set editorial_status = 'personal'
where source = 'user';

drop policy if exists "content readable by entitled users" on questions;
create policy "content readable by entitled users" on questions
  for select to authenticated
  using (
    (select has_billing_access())
    and (
      (source = 'user' and created_by = auth.uid())
      or distribution_rights_status in ('original', 'licensed')
    )
  );

create or replace function get_public_subject_counts()
returns table(id text, name text, question_count int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, count(q.qid)::int
  from subjects s
  left join questions q
    on q.subject_id = s.id
   and q.source <> 'user'
   and q.distribution_rights_status in ('original', 'licensed')
  where s.id = any(array['medicine', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_public_subject_counts() from public;
grant execute on function get_public_subject_counts() to anon, authenticated;

create index if not exists questions_rights_status_idx on questions(distribution_rights_status);
create index if not exists questions_editorial_review_due_idx
  on questions(last_reviewed_at)
  where editorial_status in ('reviewed', 'stale');
