-- Merge verified duplicate questions into their cleaner canonical records.

create temporary table duplicate_question_map (
  remove_qid int primary key,
  keep_qid int not null
) on commit drop;

insert into duplicate_question_map (remove_qid, keep_qid) values
  (1000000, 13401),
  (1000001, 12567),
  (1000002, 17649),
  (1000003, 18506),
  (1000004, 19680),
  (1000005, 13170),
  (1000006, 12043),
  (1000007, 16867),
  (1000008, 14336),
  (1000009, 13402),
  (13116, 12973),
  (13563, 12070);

-- Refuse to delete a row if the expected survivor is absent or its stem differs.
do $$
begin
  if exists (
    select 1
    from duplicate_question_map m
    join questions removed on removed.qid = m.remove_qid
    left join questions kept on kept.qid = m.keep_qid
    where kept.qid is null
       or regexp_replace(lower(removed.stem), '[^a-z0-9]+', '', 'g')
          <> regexp_replace(lower(kept.stem), '[^a-z0-9]+', '', 'g')
  ) then
    raise exception 'Question deduplication safety check failed';
  end if;
end
$$;

-- Preserve user progress and author feedback if duplicates gain references before
-- this migration is applied.
update attempts a
set qid = m.keep_qid
from duplicate_question_map m
where a.qid = m.remove_qid;

update question_edits e
set qid = m.keep_qid
from duplicate_question_map m
where e.qid = m.remove_qid;

insert into flags (user_id, qid, created_at)
select f.user_id, m.keep_qid, f.created_at
from flags f
join duplicate_question_map m on m.remove_qid = f.qid
on conflict (user_id, qid) do update
set created_at = least(flags.created_at, excluded.created_at);

delete from flags f
using duplicate_question_map m
where f.qid = m.remove_qid;

insert into notes (user_id, qid, body, updated_at)
select n.user_id, m.keep_qid, n.body, n.updated_at
from notes n
join duplicate_question_map m on m.remove_qid = n.qid
on conflict (user_id, qid) do update
set body = case
      when excluded.updated_at > notes.updated_at then excluded.body
      else notes.body
    end,
    updated_at = greatest(notes.updated_at, excluded.updated_at);

delete from notes n
using duplicate_question_map m
where n.qid = m.remove_qid;

update sessions s
set question_ids = (
  select array_agg(mapped_qid order by first_position)
  from (
    select
      coalesce(m.keep_qid, item.qid) as mapped_qid,
      min(item.position) as first_position
    from unnest(s.question_ids) with ordinality as item(qid, position)
    left join duplicate_question_map m on m.remove_qid = item.qid
    group by coalesce(m.keep_qid, item.qid)
  ) mapped
)
where exists (
  select 1
  from unnest(s.question_ids) as item(qid)
  join duplicate_question_map m on m.remove_qid = item.qid
);

-- Preserve QBank hierarchy and image references when present.
insert into qbank_question_categories (qid, category_id)
select m.keep_qid, qc.category_id
from qbank_question_categories qc
join duplicate_question_map m on m.remove_qid = qc.qid
on conflict (qid, category_id) do nothing;

delete from qbank_question_categories qc
using duplicate_question_map m
where qc.qid = m.remove_qid;

insert into qbank_question_topics (qid, topic_id)
select m.keep_qid, qt.topic_id
from qbank_question_topics qt
join duplicate_question_map m on m.remove_qid = qt.qid
on conflict (qid) do nothing;

delete from qbank_question_topics qt
using duplicate_question_map m
where qt.qid = m.remove_qid;

insert into qbank_question_images (
  qid,
  image_index,
  name,
  mime_type,
  byte_length,
  sha256,
  storage_path,
  source_path
)
select
  m.keep_qid,
  qi.image_index,
  qi.name,
  qi.mime_type,
  qi.byte_length,
  qi.sha256,
  qi.storage_path,
  qi.source_path
from qbank_question_images qi
join duplicate_question_map m on m.remove_qid = qi.qid
on conflict (qid, image_index) do nothing;

delete from qbank_question_images qi
using duplicate_question_map m
where qi.qid = m.remove_qid;

delete from questions q
using duplicate_question_map m
where q.qid = m.remove_qid;

-- Prevent punctuation and formatting variants of the same stem from being stored
-- as separate questions in the future.
create unique index if not exists questions_normalized_stem_unique_idx
  on questions ((regexp_replace(lower(stem), '[^a-z0-9]+', '', 'g')));
