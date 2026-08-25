-- Preserve the full QBank category, subject, topic, explanation, and image hierarchy.

alter table questions drop constraint if exists questions_source_check;
alter table questions
  add constraint questions_source_check
  check (source in ('canadaqbank', 'qbankmd', 'user'));

alter table questions
  add column if not exists qbank_question_id int,
  add column if not exists source_category text,
  add column if not exists source_subject text,
  add column if not exists source_topic text,
  add column if not exists answer_key text,
  add column if not exists key_points text,
  add column if not exists option_explanations jsonb,
  add column if not exists references_text text,
  add column if not exists source_raw jsonb;

create table if not exists qbank_categories (
  id                    text primary key,
  name                  text not null unique,
  expected_count        int not null,
  selected_count        int not null,
  exported_count        int not null,
  status                text not null,
  missing_question_ids  jsonb not null default '[]'::jsonb,
  updated_at            timestamptz not null default now()
);

create table if not exists qbank_question_categories (
  qid          int not null references questions(qid) on delete cascade,
  category_id  text not null references qbank_categories(id) on delete cascade,
  primary key (qid, category_id)
);
create index if not exists qbank_question_categories_category_idx
  on qbank_question_categories(category_id, qid);

create table if not exists qbank_subjects (
  id           text primary key,
  category_id  text not null references qbank_categories(id) on delete cascade,
  name         text not null,
  unique (category_id, name)
);
create index if not exists qbank_subjects_category_idx
  on qbank_subjects(category_id, name);

create table if not exists qbank_topics (
  id          text primary key,
  subject_id  text not null references qbank_subjects(id) on delete cascade,
  name        text not null,
  unique (subject_id, name)
);
create index if not exists qbank_topics_subject_idx
  on qbank_topics(subject_id, name);

create table if not exists qbank_question_topics (
  qid       int primary key references questions(qid) on delete cascade,
  topic_id  text not null references qbank_topics(id) on delete cascade
);
create index if not exists qbank_question_topics_topic_idx
  on qbank_question_topics(topic_id, qid);

create table if not exists qbank_question_images (
  qid           int not null references questions(qid) on delete cascade,
  image_index   int not null,
  name          text not null,
  mime_type     text not null,
  byte_length   int not null,
  sha256        text not null,
  storage_path  text not null,
  source_path   text,
  primary key (qid, image_index)
);

alter table qbank_categories enable row level security;
alter table qbank_question_categories enable row level security;
alter table qbank_subjects enable row level security;
alter table qbank_topics enable row level security;
alter table qbank_question_topics enable row level security;
alter table qbank_question_images enable row level security;

drop policy if exists "qbank categories readable by signed-in users" on qbank_categories;
create policy "qbank categories readable by signed-in users"
  on qbank_categories for select to authenticated using (true);
drop policy if exists "qbank memberships readable by signed-in users" on qbank_question_categories;
create policy "qbank memberships readable by signed-in users"
  on qbank_question_categories for select to authenticated using (true);
drop policy if exists "qbank subjects readable by signed-in users" on qbank_subjects;
create policy "qbank subjects readable by signed-in users"
  on qbank_subjects for select to authenticated using (true);
drop policy if exists "qbank topics readable by signed-in users" on qbank_topics;
create policy "qbank topics readable by signed-in users"
  on qbank_topics for select to authenticated using (true);
drop policy if exists "qbank question topics readable by signed-in users" on qbank_question_topics;
create policy "qbank question topics readable by signed-in users"
  on qbank_question_topics for select to authenticated using (true);
drop policy if exists "qbank images readable by signed-in users" on qbank_question_images;
create policy "qbank images readable by signed-in users"
  on qbank_question_images for select to authenticated using (true);

insert into storage.buckets (
  id, name, public, file_size_limit,
  allowed_mime_types
) values (
  'qbank-images', 'qbank-images', false, 20971520,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can read private qbank image objects" on storage.objects;
create policy "authenticated users can read private qbank image objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'qbank-images');

create or replace view qbank_category_counts with (security_invoker = true) as
select
  c.id,
  c.name,
  c.expected_count,
  c.selected_count,
  c.exported_count,
  c.status,
  count(qc.qid)::int as unique_question_count
from qbank_categories c
left join qbank_question_categories qc on qc.category_id = c.id
group by c.id, c.name, c.expected_count, c.selected_count, c.exported_count, c.status
order by c.name;

create or replace view qbank_source_hierarchy with (security_invoker = true) as
select
  c.id as category_id,
  c.name as category,
  s.id as subject_id,
  s.name as subject,
  t.id as topic_id,
  t.name as topic,
  count(qt.qid)::int as unique_question_count
from qbank_categories c
join qbank_subjects s on s.category_id = c.id
join qbank_topics t on t.subject_id = s.id
left join qbank_question_topics qt on qt.topic_id = t.id
group by c.id, c.name, s.id, s.name, t.id, t.name
order by c.name, s.name, t.name;
