-- Montreal QBank core schema. Apply in Supabase SQL editor or `supabase db push`.

create extension if not exists pgcrypto;

-- ---------- content (read-only for users) ----------
create table subjects (
  id   text primary key,          -- slug: 'medicine', 'pediatrics', ...
  name text not null,
  sort int  not null default 0
);

create table topics (
  id         text primary key,    -- slug: 'pediatrics/meningitis'
  subject_id text not null references subjects(id),
  name       text not null
);
create index topics_subject_idx on topics(subject_id);

create table questions (
  qid           int  primary key,          -- CanadaQBank QID (synthetic 9xxxx for OCR-lost ones)
  subject_id    text not null references subjects(id),
  topic_id      text not null references topics(id),
  stem          text not null,
  options       jsonb not null,            -- ["text a","text b",...]
  answer_index  int  not null,
  explanation   jsonb not null,            -- ["para 1","para 2",...]
  has_figure    boolean not null default false,
  figure_url    text,
  source_pages  int[] not null default '{}',
  needs_review  boolean not null default false,
  review_note   text
);
create index questions_subject_idx on questions(subject_id);
create index questions_topic_idx on questions(topic_id);

-- ---------- per-user data ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  mode                text not null check (mode in ('tutor','timed')),
  question_ids        int[] not null,
  seconds_per_question int,
  filters             jsonb not null default '{}',
  current_index       int  not null default 0,
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index sessions_user_idx on sessions(user_id, created_at desc);

create table attempts (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid references sessions(id) on delete cascade,
  qid         int  not null references questions(qid),
  chosen_index int,                        -- null = skipped / timed out
  correct     boolean not null,
  time_ms     int not null default 0,
  created_at  timestamptz not null default now()
);
create index attempts_user_qid_idx on attempts(user_id, qid, created_at desc);
create index attempts_user_created_idx on attempts(user_id, created_at);

create table flags (
  user_id    uuid not null references auth.users(id) on delete cascade,
  qid        int  not null references questions(qid),
  created_at timestamptz not null default now(),
  primary key (user_id, qid)
);

create table notes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  qid        int  not null references questions(qid),
  body       text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, qid)
);

create table question_edits (                -- in-app "report typo"
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  qid        int  not null references questions(qid),
  field      text not null,                  -- 'stem' | 'option:2' | 'explanation'
  suggestion text not null,
  created_at timestamptz not null default now()
);

create table access_requests (               -- landing-page "Request access" form
  id         bigserial primary key,
  email      text not null,
  name       text,
  message    text,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table subjects  enable row level security;
alter table topics    enable row level security;
alter table questions enable row level security;
alter table profiles  enable row level security;
alter table sessions  enable row level security;
alter table attempts  enable row level security;
alter table flags     enable row level security;
alter table notes     enable row level security;
alter table question_edits enable row level security;
alter table access_requests enable row level security;

create policy "content readable by signed-in users" on subjects  for select to authenticated using (true);
create policy "content readable by signed-in users" on topics    for select to authenticated using (true);
create policy "content readable by signed-in users" on questions for select to authenticated using (true);

create policy "own profile"  on profiles  for all to authenticated using (id = auth.uid())      with check (id = auth.uid());
create policy "own sessions" on sessions  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attempts" on attempts  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own flags"    on flags     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes"    on notes     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "submit edits" on question_edits for insert to authenticated with check (user_id = auth.uid());
create policy "anyone can request access" on access_requests for insert to anon, authenticated with check (true);

-- auto-create profile
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- stats views (RLS on attempts scopes these to the caller) ----------
-- last result per question for the current user
create view user_question_status with (security_invoker = true) as
select distinct on (a.user_id, a.qid)
  a.user_id, a.qid, a.correct as last_correct, a.created_at as last_attempt_at,
  exists (select 1 from flags f where f.user_id = a.user_id and f.qid = a.qid) as flagged
from attempts a
order by a.user_id, a.qid, a.created_at desc;

create view subject_stats with (security_invoker = true) as
select a.user_id, q.subject_id,
  count(*)               as attempted,
  count(*) filter (where a.correct) as correct,
  count(distinct a.qid)  as unique_questions,
  avg(a.time_ms)::int    as avg_time_ms
from attempts a join questions q on q.qid = a.qid
group by a.user_id, q.subject_id;

create view topic_stats with (security_invoker = true) as
select a.user_id, q.subject_id, q.topic_id,
  count(*)               as attempted,
  count(*) filter (where a.correct) as correct,
  avg(a.time_ms)::int    as avg_time_ms
from attempts a join questions q on q.qid = a.qid
group by a.user_id, q.subject_id, q.topic_id;

create view daily_activity with (security_invoker = true) as
select user_id, (created_at at time zone 'America/Toronto')::date as day,
  count(*) as attempted, count(*) filter (where correct) as correct
from attempts group by 1, 2;

-- pick questions for a new session
create or replace function pick_questions(
  p_subjects text[], p_topics text[], p_status text, p_limit int
) returns setof int language sql security invoker stable as $$
  select q.qid from questions q
  left join user_question_status s on s.qid = q.qid and s.user_id = auth.uid()
  where (p_subjects is null or q.subject_id = any(p_subjects))
    and (p_topics   is null or q.topic_id   = any(p_topics))
    and case p_status
          when 'unused'    then s.qid is null
          when 'incorrect' then s.last_correct = false
          when 'flagged'   then s.flagged
          else true end
  order by random() limit p_limit;
$$;
