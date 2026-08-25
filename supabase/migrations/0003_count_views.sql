-- Subject/topic lists with question counts (used by the web app).
create view subject_counts with (security_invoker = true) as
select s.id, s.name, s.sort, count(q.qid)::int as question_count
from subjects s left join questions q on q.subject_id = s.id
group by s.id, s.name, s.sort order by s.sort, s.name;

create view topic_counts with (security_invoker = true) as
select t.id, t.subject_id, t.name, count(q.qid)::int as question_count
from topics t left join questions q on q.topic_id = t.id
group by t.id, t.subject_id, t.name order by t.subject_id, t.name;
