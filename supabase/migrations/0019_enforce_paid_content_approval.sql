-- Keep unapproved bank content out of public counts and paid distribution.
-- The private beta can continue reviewing legacy content while billing is off.

alter table questions
  add column if not exists content_author text,
  add column if not exists license_or_permission text,
  add column if not exists permission_evidence_uri text,
  add column if not exists transformation_history jsonb not null default '[]'::jsonb,
  add column if not exists provenance_reviewed_at date,
  add column if not exists provenance_reviewer_role text;

alter table qbank_question_images
  add column if not exists distribution_rights_status text not null default 'unverified',
  add column if not exists distribution_rights_note text,
  add column if not exists content_author text,
  add column if not exists license_or_permission text,
  add column if not exists permission_evidence_uri text,
  add column if not exists transformation_history jsonb not null default '[]'::jsonb,
  add column if not exists provenance_reviewed_at date,
  add column if not exists provenance_reviewer_role text;

alter table qbank_question_images drop constraint if exists qbank_question_images_distribution_rights_status_check;
alter table qbank_question_images add constraint qbank_question_images_distribution_rights_status_check
  check (distribution_rights_status in ('original', 'licensed', 'unverified', 'quarantined'));

create index if not exists qbank_question_images_rights_status_idx
  on qbank_question_images(distribution_rights_status);

create or replace function paid_content_approval_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select billing_required from billing_settings where id = true),
    false
  );
$$;

revoke all on function paid_content_approval_required() from public;
revoke all on function paid_content_approval_required() from anon;
grant execute on function paid_content_approval_required() to authenticated, service_role;

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
          not (select paid_content_approval_required())
          or (
            distribution_rights_status in ('original', 'licensed')
            and editorial_status = 'reviewed'
          )
        )
      )
    )
  );

drop policy if exists "qbank images readable by entitled users" on qbank_question_images;
create policy "qbank images readable by entitled users" on qbank_question_images
  for select to authenticated
  using (
    (select has_billing_access())
    and (
      not (select paid_content_approval_required())
      or (
        distribution_rights_status in ('original', 'licensed')
        and exists (
          select 1
          from questions q
          where q.qid = qbank_question_images.qid
            and q.source <> 'user'
            and q.distribution_rights_status in ('original', 'licensed')
            and q.editorial_status = 'reviewed'
        )
      )
    )
  );

drop policy if exists "entitled users can read private qbank image objects" on storage.objects;
create policy "entitled users can read private qbank image objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qbank-images'
    and (select has_billing_access())
    and (
      not (select paid_content_approval_required())
      or exists (
        select 1
        from qbank_question_images qi
        where qi.storage_path = storage.objects.name
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
   and q.distribution_rights_status in ('original', 'licensed')
   and q.editorial_status = 'reviewed'
   and not exists (
     select 1
     from qbank_question_images qi
     where qi.qid = q.qid
       and qi.distribution_rights_status not in ('original', 'licensed')
   )
  where s.id = any(array['medicine', 'pediatrics', 'pmch', 'psychiatry', 'surgery'])
  group by s.id, s.name, s.sort
  order by s.sort, s.name;
$$;

revoke all on function get_approved_public_subject_counts() from public;
grant execute on function get_approved_public_subject_counts() to anon, authenticated;

-- Keep the legacy RPC safe for older deployments during a rolling release.
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
