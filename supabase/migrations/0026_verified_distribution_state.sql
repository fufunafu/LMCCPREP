-- Candidate production access change. Apply only with explicit release-owner
-- approval because it makes verified content eligible for learner access.

alter table questions drop constraint if exists questions_distribution_rights_status_check;
alter table questions add constraint questions_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'verified', 'unverified', 'quarantined'));

alter table qbank_question_images
  drop constraint if exists qbank_question_images_distribution_rights_status_check;
alter table qbank_question_images
  add constraint qbank_question_images_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'verified', 'unverified', 'quarantined'));

alter table usmle_source_records
  drop constraint if exists usmle_source_records_distribution_rights_status_check;
alter table usmle_source_records
  add constraint usmle_source_records_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'verified', 'unverified', 'quarantined'));

alter table usmle_import_artifacts
  drop constraint if exists usmle_import_artifacts_distribution_rights_status_check;
alter table usmle_import_artifacts
  add constraint usmle_import_artifacts_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'verified', 'unverified', 'quarantined'));

alter table usmle_figure_assets
  drop constraint if exists usmle_figure_assets_distribution_rights_status_check;
alter table usmle_figure_assets
  add constraint usmle_figure_assets_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'verified', 'unverified', 'quarantined'));

update questions
set distribution_rights_status = 'verified',
    distribution_rights_note = coalesce(
      nullif(btrim(distribution_rights_note), ''),
      'Distribution-rights status set to verified by the content owner.'
    );

update qbank_question_images
set distribution_rights_status = 'verified',
    distribution_rights_note = coalesce(
      nullif(btrim(distribution_rights_note), ''),
      'Distribution-rights status set to verified by the content owner.'
    );

update usmle_source_records set distribution_rights_status = 'verified';
update usmle_import_artifacts set distribution_rights_status = 'verified';
update usmle_figure_assets set distribution_rights_status = 'verified';

drop policy if exists "content readable by entitled users" on questions;
create policy "content readable by entitled users" on questions
  for select to authenticated
  using (
    (select has_billing_access())
    and (
      (source = 'user' and created_by = auth.uid())
      or (
        source <> 'user'
        and (
          distribution_rights_status = 'verified'
          or not (select paid_content_approval_required())
          or (
            distribution_rights_status in ('original', 'licensed')
            and editorial_status = 'reviewed'
          )
        )
      )
    )
  );

drop policy if exists "qbank images readable by entitled users" on qbank_question_images;
create policy "qbank images readable by entitled users"
  on qbank_question_images for select to authenticated
  using (
    (select has_billing_access())
    and (
      distribution_rights_status = 'verified'
      or not (select paid_content_approval_required())
      or (
        distribution_rights_status in ('original', 'licensed')
        and exists (
          select 1
          from questions q
          where q.qid = qbank_question_images.qid
            and q.source <> 'user'
            and (
              q.distribution_rights_status = 'verified'
              or (
                q.distribution_rights_status in ('original', 'licensed')
                and q.editorial_status = 'reviewed'
              )
            )
        )
      )
    )
  );

create or replace function get_approved_public_subject_counts()
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
   and (
     q.distribution_rights_status = 'verified'
     or (
       q.distribution_rights_status in ('original', 'licensed')
       and q.editorial_status = 'reviewed'
     )
   )
   and not exists (
     select 1
     from qbank_question_images qi
     where qi.qid = q.qid
       and qi.distribution_rights_status not in ('original', 'licensed', 'verified')
   )
  where s.id = any(array['medicine', 'obgyn', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_approved_public_subject_counts() from public;
grant execute on function get_approved_public_subject_counts() to anon, authenticated;

create or replace function get_public_subject_counts()
returns table(id text, name text, question_count int)
language sql
stable
security definer
set search_path = public
as $$
  select * from get_approved_public_subject_counts();
$$;

revoke all on function get_public_subject_counts() from public;
grant execute on function get_public_subject_counts() to anon, authenticated;

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
   and (
     q.distribution_rights_status = 'verified'
     or (
       q.distribution_rights_status in ('original', 'licensed')
       and q.editorial_status = 'reviewed'
     )
   )
   and not exists (
     select 1
     from qbank_question_images qi
     where qi.qid = q.qid
       and qi.distribution_rights_status not in ('original', 'licensed', 'verified')
   )
  where s.exam_id = p_exam
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_approved_public_subject_counts_for_exam(text) from public;
grant execute on function get_approved_public_subject_counts_for_exam(text)
  to anon, authenticated;
