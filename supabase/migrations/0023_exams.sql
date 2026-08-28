-- Exam dimension: the bank can hold content for more than one licensing exam.
-- Subjects belong to exactly one exam; learners pick an active exam on their
-- profile and the app scopes subjects, topics, questions and stats to it.
-- No question content is added here: USMLE subjects start empty and only
-- rights-approved, editorially reviewed items ever become distributable
-- (see migration 0019 and CONTENT_GOVERNANCE.md).

create table if not exists exams (
  id                   text primary key,
  name                 text not null,
  short_name           text not null,
  sort                 int  not null default 0,
  seconds_per_question int  not null check (seconds_per_question between 30 and 300),
  section_size         int  not null check (section_size between 10 and 200)
);

insert into exams (id, name, short_name, sort, seconds_per_question, section_size) values
  ('mccqe', 'MCCQE Part I', 'MCCQE', 0, 83, 115),
  ('usmle', 'USMLE Step 1 and Step 2 CK', 'USMLE', 1, 90, 40)
on conflict (id) do nothing;

alter table exams enable row level security;
drop policy if exists exams_read on exams;
create policy exams_read on exams for select to anon, authenticated using (true);

alter table subjects
  add column if not exists exam_id text not null default 'mccqe' references exams(id);
create index if not exists subjects_exam_idx on subjects(exam_id);

-- USMLE organ-system taxonomy. Names only; no questions.
insert into subjects (id, name, sort, exam_id) values
  ('usmle-cardiovascular',      'Cardiovascular System',                                 100, 'usmle'),
  ('usmle-nervous',             'Nervous System',                                        101, 'usmle'),
  ('usmle-gastrointestinal',    'Gastrointestinal and Nutrition',                        102, 'usmle'),
  ('usmle-pulmonary',           'Pulmonary and Critical Care',                           103, 'usmle'),
  ('usmle-renal',               'Renal, Urinary Systems, and Electrolytes',              104, 'usmle'),
  ('usmle-endocrine',           'Endocrine, Diabetes, and Metabolism',                   105, 'usmle'),
  ('usmle-hematology-oncology', 'Hematology and Oncology',                               106, 'usmle'),
  ('usmle-microbiology',        'Microbiology',                                          107, 'usmle'),
  ('usmle-immunology',          'Allergy and Immunology',                                108, 'usmle'),
  ('usmle-rheumatology',        'Rheumatology, Orthopedics, and Sports Medicine',        109, 'usmle'),
  ('usmle-dermatology',         'Dermatology',                                           110, 'usmle'),
  ('usmle-psychiatry',          'Psychiatric, Behavioral, and Substance Use Disorders',  111, 'usmle'),
  ('usmle-female-reproductive', 'Female Reproductive System and Breast',                 112, 'usmle'),
  ('usmle-pregnancy',           'Pregnancy, Childbirth, and Puerperium',                 113, 'usmle'),
  ('usmle-male-reproductive',   'Male Reproductive System',                              114, 'usmle'),
  ('usmle-ent',                 'Ear, Nose, and Throat',                                 115, 'usmle'),
  ('usmle-ophthalmology',       'Ophthalmology',                                         116, 'usmle'),
  ('usmle-biochemistry',        'Biochemistry',                                          117, 'usmle'),
  ('usmle-pharmacology',        'General Pharmacology',                                  118, 'usmle'),
  ('usmle-pathology',           'General Pathology',                                     119, 'usmle'),
  ('usmle-biostatistics',       'Biostatistics and Epidemiology',                        120, 'usmle'),
  ('usmle-social-sciences',     'Social Sciences, Ethics, Legal, and Professional',      121, 'usmle'),
  ('usmle-toxicology',          'Poisoning and Environmental Exposure',                  122, 'usmle'),
  ('usmle-multisystem',         'Miscellaneous and Multisystem',                         123, 'usmle')
on conflict (id) do nothing;

alter table profiles
  add column if not exists exam_id text not null default 'mccqe' references exams(id);

-- Expose the exam on the subject list (column appended, so dependents keep working).
create or replace view subject_counts with (security_invoker = true) as
select s.id, s.name, s.sort, count(q.qid)::int as question_count, s.exam_id
from subjects s left join questions q on q.subject_id = s.id
group by s.id, s.name, s.sort, s.exam_id order by s.sort, s.name;

-- Anonymous approved counts for any exam. The legacy MCCQE-only RPC from
-- migration 0019 is unchanged and remains the homepage source.
create or replace function get_approved_public_subject_counts_for_exam(p_exam text)
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
   and q.distribution_rights_status in ('original', 'licensed')
   and q.editorial_status = 'reviewed'
   and not exists (
     select 1
     from qbank_question_images qi
     where qi.qid = q.qid
       and qi.distribution_rights_status not in ('original', 'licensed')
   )
  where s.exam_id = p_exam
    and s.id <> 'obgyn'
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_approved_public_subject_counts_for_exam(text) from public;
grant execute on function get_approved_public_subject_counts_for_exam(text) to anon, authenticated;
