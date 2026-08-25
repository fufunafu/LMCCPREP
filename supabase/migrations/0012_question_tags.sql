-- Add normalized, searchable tags to every question.

alter table questions
  add column if not exists tags text[] not null default '{}'::text[];

create or replace function normalize_question_tags(p_tags text[])
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(tag order by tag), '{}'::text[])
  from (
    select distinct normalized as tag
    from (
      select regexp_replace(
        regexp_replace(lower(trim(raw_tag)), '[*_`]+', '', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      ) as normalized
      from unnest(coalesce(p_tags, '{}'::text[])) as raw(raw_tag)
      where raw_tag is not null
    ) cleaned
    where normalized <> ''
      and char_length(normalized) between 2 and 80
      and normalized not in (
        'all of the above', 'none of the above', 'other', 'general',
        'miscellaneous', 'yes', 'no', 'true', 'false'
      )
  ) unique_tags;
$$;

create or replace function question_task_tag(p_stem text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_stem ~* '(most likely|likely) diagnosis|diagnosis is|diagnosed with' then 'diagnosis'
    when p_stem ~* 'most appropriate (next step|management|treatment)|best (next step|management|treatment)|treatment of choice' then 'management'
    when p_stem ~* 'most appropriate (test|investigation)|best (test|investigation)|confirm the diagnosis' then 'diagnostic testing'
    when p_stem ~* 'screening|screen for' then 'screening'
    when p_stem ~* 'mechanism of action|pathophysiology' then 'mechanism'
    when p_stem ~* 'adverse effect|side effect|toxicity' then 'adverse effects'
    when p_stem ~* 'ethic|consent|confidential|capacity|legal' then 'ethics and law'
    when p_stem ~* 'sensitivity|specificity|relative risk|odds ratio|attributable risk|study design' then 'epidemiology'
    else null
  end;
$$;

update questions q
set tags = normalize_question_tags(array[
  s.name,
  t.name,
  q.source_subject,
  q.source_topic,
  case
    when char_length(coalesce(q.options ->> q.answer_index, '')) between 2 and 80
      and array_length(regexp_split_to_array(trim(q.options ->> q.answer_index), '[[:space:]]+'), 1) <= 8
    then q.options ->> q.answer_index
    else null
  end,
  question_task_tag(q.stem)
])
from subjects s, topics t
where s.id = q.subject_id
  and t.id = q.topic_id
  and cardinality(q.tags) = 0;

create or replace function set_question_tags()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subject_name text;
  v_topic_name text;
  v_answer text;
begin
  select name into v_subject_name from subjects where id = new.subject_id;
  select name into v_topic_name from topics where id = new.topic_id;
  v_answer := case
    when char_length(coalesce(new.options ->> new.answer_index, '')) between 2 and 80
      and array_length(regexp_split_to_array(trim(new.options ->> new.answer_index), '[[:space:]]+'), 1) <= 8
    then new.options ->> new.answer_index
    else null
  end;
  new.tags := normalize_question_tags(
    coalesce(new.tags, '{}'::text[])
    || array[v_subject_name, v_topic_name, new.source_subject, new.source_topic, v_answer, question_task_tag(new.stem)]
  );
  return new;
end;
$$;

drop trigger if exists questions_normalize_tags on questions;
create trigger questions_normalize_tags
before insert or update of tags on questions
for each row execute function set_question_tags();

alter table questions drop constraint if exists questions_tags_present;
alter table questions
  add constraint questions_tags_present check (cardinality(tags) > 0);

create index if not exists questions_tags_gin_idx on questions using gin(tags);

drop function if exists add_user_question(text, text, text, jsonb, int, jsonb);
create or replace function add_user_question(
  p_subject_id text,
  p_topic_name text,
  p_stem text,
  p_options jsonb,
  p_answer_index int,
  p_explanation jsonb,
  p_tags text[] default null
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_topic text;
  v_qid int;
begin
  v_topic := p_subject_id || '/' || regexp_replace(lower(p_topic_name), '[^a-z0-9]+', '-', 'g');
  insert into topics(id, subject_id, name)
  values (v_topic, p_subject_id, p_topic_name)
  on conflict (id) do nothing;

  v_qid := nextval('user_question_qid');
  insert into questions(
    qid, subject_id, topic_id, stem, options, answer_index,
    explanation, source, created_by, tags
  ) values (
    v_qid, p_subject_id, v_topic, p_stem, p_options, p_answer_index,
    p_explanation, 'user', auth.uid(), coalesce(p_tags, '{}'::text[])
  );
  return v_qid;
end;
$$;
