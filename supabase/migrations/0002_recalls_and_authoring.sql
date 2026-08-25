-- Recalls (read-only, no answer key) + user-authored questions.

create table recalls (
  id          int primary key,
  source_page int,
  stem        text not null,
  options     jsonb not null
);
alter table recalls enable row level security;
create policy "recalls readable by signed-in users" on recalls for select to authenticated using (true);

alter table questions
  add column source     text not null default 'canadaqbank' check (source in ('canadaqbank','user')),
  add column created_by uuid references auth.users(id) on delete set null,
  add column created_at timestamptz not null default now();

-- user-authored questions use qids >= 1,000,000
create sequence user_question_qid start 1000000;

create policy "authors can insert own questions" on questions
  for insert to authenticated
  with check (source = 'user' and created_by = auth.uid() and qid >= 1000000);
create policy "authors can edit own questions" on questions
  for update to authenticated
  using (source = 'user' and created_by = auth.uid())
  with check (source = 'user' and created_by = auth.uid());
create policy "authors can delete own questions" on questions
  for delete to authenticated
  using (source = 'user' and created_by = auth.uid());

-- helper: create a user question with the next qid; topic is created on the fly
create or replace function add_user_question(
  p_subject_id text, p_topic_name text, p_stem text, p_options jsonb, p_answer_index int, p_explanation jsonb
) returns int language plpgsql security invoker as $$
declare v_topic text; v_qid int;
begin
  v_topic := p_subject_id || '/' || regexp_replace(lower(p_topic_name), '[^a-z0-9]+', '-', 'g');
  insert into topics(id, subject_id, name) values (v_topic, p_subject_id, p_topic_name) on conflict (id) do nothing;
  v_qid := nextval('user_question_qid');
  insert into questions(qid, subject_id, topic_id, stem, options, answer_index, explanation, source, created_by)
  values (v_qid, p_subject_id, v_topic, p_stem, p_options, p_answer_index, p_explanation, 'user', auth.uid());
  return v_qid;
end $$;

-- topics need an insert policy for the helper above
create policy "authors can add topics" on topics for insert to authenticated with check (true);

-- extra subjects users may author into
insert into subjects(id, name, sort) values ('obgyn', 'Obstetrics & Gynecology', 10) on conflict (id) do nothing;
