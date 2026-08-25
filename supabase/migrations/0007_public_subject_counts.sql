-- Expose only aggregate counts for the five core marketing subjects.
create or replace function get_public_subject_counts()
returns table(id text, name text, question_count int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, count(q.qid)::int
  from subjects s
  left join questions q on q.subject_id = s.id
  where s.id = any(array['medicine', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_public_subject_counts() from public;
grant execute on function get_public_subject_counts() to anon, authenticated;
