#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const batchPath = resolve(projectDirectory, "audit-output/semantic-duplicate-resolutions-v1.json");
const migrationPath = resolve(projectDirectory, "supabase/migrations/0021_remove_reviewed_duplicate_questions.sql");
const batch = JSON.parse(await readFile(batchPath, "utf8"));
const deletions = Array.isArray(batch.deletions) ? batch.deletions : [];

if (batch.batch_id !== "semantic-duplicate-resolutions-v1" || deletions.length !== 936) {
  throw new Error("Expected the reviewed 936-question duplicate batch.");
}

const removed = new Set();
const survivorByRemoved = new Map();
for (const deletion of deletions) {
  if (!Number.isInteger(deletion.remove_qid) || !Number.isInteger(deletion.keep_qid)) {
    throw new Error("Every duplicate mapping must use integer qids.");
  }
  if (deletion.remove_qid === deletion.keep_qid || removed.has(deletion.remove_qid)) {
    throw new Error(`Invalid or repeated removal qid ${deletion.remove_qid}.`);
  }
  removed.add(deletion.remove_qid);
  survivorByRemoved.set(deletion.remove_qid, deletion.keep_qid);
}

function terminalSurvivor(removeQid) {
  const visited = new Set([removeQid]);
  let survivor = survivorByRemoved.get(removeQid);
  while (removed.has(survivor)) {
    if (visited.has(survivor)) throw new Error(`Duplicate mapping cycle at qid ${survivor}.`);
    visited.add(survivor);
    survivor = survivorByRemoved.get(survivor);
  }
  return survivor;
}

const normalizedDeletions = deletions.map((deletion) => ({
  ...deletion,
  keep_qid: terminalSurvivor(deletion.remove_qid),
}));

const values = normalizedDeletions
  .sort((left, right) => left.remove_qid - right.remove_qid)
  .map(({ remove_qid: removeQid, keep_qid: keepQid }) => `  (${removeQid}, ${keepQid})`)
  .join(",\n");
const approvedImageDeletionValues = normalizedDeletions
  .filter((deletion) => deletion.allow_image_asset_deletion === true)
  .map(({ remove_qid: removeQid }) => `  (${removeQid})`)
  .join(",\n");

const sql = `-- Remove confirmed duplicate questions from the full reviewed corpus.
-- User attempts, flags, notes, edit reports, sessions, and taxonomy links are kept.

begin;

create temporary table reviewed_duplicate_question_map (
  remove_qid int primary key,
  keep_qid int not null
) on commit drop;

insert into reviewed_duplicate_question_map (remove_qid, keep_qid) values
${values};

create temporary table approved_duplicate_image_deletions (
  remove_qid int primary key
) on commit drop;

insert into approved_duplicate_image_deletions (remove_qid) values
${approvedImageDeletionValues};

do $$
begin
  if (select count(*) from reviewed_duplicate_question_map) <> 936 then
    raise exception 'Expected exactly 936 reviewed duplicate mappings';
  end if;

  if exists (
    select 1
    from reviewed_duplicate_question_map m
    left join questions kept on kept.qid = m.keep_qid
    where kept.qid is null
  ) then
    raise exception 'A reviewed duplicate terminal survivor is missing';
  end if;

  if exists (
    select 1
    from reviewed_duplicate_question_map m
    join reviewed_duplicate_question_map nested on nested.remove_qid = m.keep_qid
  ) then
    raise exception 'A reviewed duplicate mapping does not use a terminal survivor';
  end if;

  if exists (
    select 1
    from qbank_question_images qi
    join reviewed_duplicate_question_map m on m.remove_qid = qi.qid
    left join approved_duplicate_image_deletions approved on approved.remove_qid = qi.qid
    where approved.remove_qid is null
  ) then
    raise exception 'A duplicate with image metadata lacks explicit deletion approval';
  end if;
end
$$;

update attempts a
set qid = m.keep_qid
from reviewed_duplicate_question_map m
where a.qid = m.remove_qid;

update question_edits e
set qid = m.keep_qid
from reviewed_duplicate_question_map m
where e.qid = m.remove_qid;

insert into flags (user_id, qid, created_at)
select f.user_id, m.keep_qid, min(f.created_at)
from flags f
join reviewed_duplicate_question_map m on m.remove_qid = f.qid
group by f.user_id, m.keep_qid
on conflict (user_id, qid) do update
set created_at = least(flags.created_at, excluded.created_at);

delete from flags f
using reviewed_duplicate_question_map m
where f.qid = m.remove_qid;

insert into notes (user_id, qid, body, updated_at)
select merged.user_id, merged.keep_qid, merged.body, merged.updated_at
from (
  select distinct on (n.user_id, m.keep_qid)
    n.user_id,
    m.keep_qid,
    n.body,
    n.updated_at
  from notes n
  join reviewed_duplicate_question_map m on m.remove_qid = n.qid
  order by n.user_id, m.keep_qid, n.updated_at desc, n.qid desc
) merged
on conflict (user_id, qid) do update
set body = case
      when excluded.updated_at > notes.updated_at then excluded.body
      else notes.body
    end,
    updated_at = greatest(notes.updated_at, excluded.updated_at);

delete from notes n
using reviewed_duplicate_question_map m
where n.qid = m.remove_qid;

create temporary table reviewed_duplicate_session_state on commit drop as
select
  s.id,
  coalesce(current_map.keep_qid, s.question_ids[s.current_index + 1]) as current_qid
from sessions s
left join reviewed_duplicate_question_map current_map
  on current_map.remove_qid = s.question_ids[s.current_index + 1]
where exists (
  select 1
  from unnest(s.question_ids) as source(qid)
  join reviewed_duplicate_question_map m on m.remove_qid = source.qid
);

update sessions s
set question_ids = (
  select array_agg(mapped_qid order by first_position)
  from (
    select
      coalesce(m.keep_qid, source.qid) as mapped_qid,
      min(source.position) as first_position
    from unnest(s.question_ids) with ordinality as source(qid, position)
    left join reviewed_duplicate_question_map m on m.remove_qid = source.qid
    group by coalesce(m.keep_qid, source.qid)
  ) mapped
)
where exists (
  select 1
  from unnest(s.question_ids) as source(qid)
  join reviewed_duplicate_question_map m on m.remove_qid = source.qid
);

update sessions s
set current_index = coalesce(
  array_position(s.question_ids, state.current_qid) - 1,
  greatest(0, least(s.current_index, cardinality(s.question_ids) - 1))
)
from reviewed_duplicate_session_state state
where state.id = s.id;

insert into qbank_question_categories (qid, category_id)
select m.keep_qid, qc.category_id
from qbank_question_categories qc
join reviewed_duplicate_question_map m on m.remove_qid = qc.qid
on conflict (qid, category_id) do nothing;

insert into qbank_question_topics (qid, topic_id)
select m.keep_qid, qt.topic_id
from qbank_question_topics qt
join reviewed_duplicate_question_map m on m.remove_qid = qt.qid
on conflict (qid) do nothing;

delete from qbank_question_images qi
using approved_duplicate_image_deletions approved
where qi.qid = approved.remove_qid;

delete from questions q
using reviewed_duplicate_question_map m
where q.qid = m.remove_qid;

do $$
begin
  if exists (
    select 1
    from reviewed_duplicate_question_map m
    join questions q on q.qid = m.remove_qid
  ) then
    raise exception 'A confirmed duplicate survived deletion';
  end if;

  if exists (
    select 1
    from reviewed_duplicate_question_map m
    left join questions q on q.qid = m.keep_qid
    where q.qid is null
  ) then
    raise exception 'A canonical survivor was removed';
  end if;

  if exists (
    select 1
    from sessions s
    cross join lateral unnest(s.question_ids) as source(qid)
    join reviewed_duplicate_question_map m on m.remove_qid = source.qid
  ) then
    raise exception 'A session still references a removed duplicate';
  end if;
end
$$;

commit;
`;

await writeFile(migrationPath, sql, "utf8");
console.log(JSON.stringify({ migration: migrationPath, duplicate_removals: deletions.length }, null, 2));
