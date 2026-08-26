-- Restore private question-bank access after the provenance schema migration.
-- Rights metadata remains available, but unclassified legacy content is not
-- hidden until an explicit publication policy and backfill are approved.

drop policy if exists "content readable by entitled users" on questions;
create policy "content readable by entitled users" on questions
  for select to authenticated
  using (
    (select has_billing_access())
    and (source <> 'user' or created_by = auth.uid())
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
  where s.id = any(array['medicine', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_public_subject_counts() from public;
grant execute on function get_public_subject_counts() to anon, authenticated;
