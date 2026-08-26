-- Keep correct-answer text out of learner-visible tags after inserts and edits.

create or replace function set_question_tags()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subject_name text;
  v_topic_name text;
  v_answer_tag text;
begin
  select name into v_subject_name from subjects where id = new.subject_id;
  select name into v_topic_name from topics where id = new.topic_id;
  v_answer_tag := regexp_replace(
    regexp_replace(lower(trim(coalesce(new.options ->> new.answer_index, ''))), '[*_`]+', '', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  );
  new.tags := normalize_question_tags(
    coalesce(new.tags, '{}'::text[])
    || array[v_subject_name, v_topic_name, new.source_subject, new.source_topic, question_task_tag(new.stem)]
  );
  new.tags := array_remove(new.tags, v_answer_tag);
  return new;
end;
$$;

update questions
set tags = array_remove(
  tags,
  regexp_replace(
    regexp_replace(lower(trim(coalesce(options ->> answer_index, ''))), '[*_`]+', '', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  )
)
where cardinality(tags) > 0;

drop trigger if exists questions_normalize_tags on questions;
create trigger questions_normalize_tags
before insert or update of tags, subject_id, topic_id, source_subject, source_topic, stem, options, answer_index on questions
for each row execute function set_question_tags();

revoke all on function set_question_tags() from public;
revoke all on function set_question_tags() from anon;
grant execute on function set_question_tags() to authenticated, service_role;
