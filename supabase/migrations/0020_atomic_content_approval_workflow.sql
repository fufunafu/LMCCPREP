-- Enforce complete approval metadata and apply reviewed batches atomically.

create or replace function content_transformation_history_valid(p_history jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    jsonb_typeof(p_history) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_history) as item
      where jsonb_typeof(item) <> 'object'
        or coalesce(item ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or nullif(btrim(item ->> 'responsible_role'), '') is null
        or nullif(btrim(item ->> 'action'), '') is null
        or coalesce(item ->> 'artifact_hash', '') !~ '^sha256:[0-9a-f]{64}$'
    );
$$;

revoke all on function content_transformation_history_valid(jsonb) from public, anon, authenticated;
grant execute on function content_transformation_history_valid(jsonb) to service_role;

alter table questions drop constraint if exists questions_transformation_history_array_check;
alter table questions add constraint questions_transformation_history_array_check
  check (content_transformation_history_valid(transformation_history));

alter table questions drop constraint if exists questions_approved_rights_complete_check;
alter table questions add constraint questions_approved_rights_complete_check
  check (
    distribution_rights_status not in ('original', 'licensed')
    or (
      nullif(btrim(distribution_rights_note), '') is not null
      and nullif(btrim(content_author), '') is not null
      and nullif(btrim(license_or_permission), '') is not null
      and nullif(btrim(permission_evidence_uri), '') is not null
      and permission_evidence_uri !~* '^data:'
      and jsonb_array_length(transformation_history) > 0
      and provenance_reviewed_at is not null
      and nullif(btrim(provenance_reviewer_role), '') is not null
    )
  );

alter table questions drop constraint if exists questions_quarantined_rights_complete_check;
alter table questions add constraint questions_quarantined_rights_complete_check
  check (
    distribution_rights_status <> 'quarantined'
    or (
      nullif(btrim(distribution_rights_note), '') is not null
      and provenance_reviewed_at is not null
      and nullif(btrim(provenance_reviewer_role), '') is not null
    )
  );

alter table questions drop constraint if exists questions_editorial_review_metadata_check;
alter table questions add constraint questions_editorial_review_metadata_check
  check (
    editorial_status not in ('reviewed', 'stale')
    or (
      last_reviewed_at is not null
      and nullif(btrim(reviewer_role), '') is not null
    )
  );

alter table questions drop constraint if exists questions_reviewed_editorial_complete_check;
alter table questions add constraint questions_reviewed_editorial_complete_check
  check (
    editorial_status <> 'reviewed'
    or (
      last_reviewed_at is not null
      and nullif(btrim(reviewer_role), '') is not null
      and (
        nullif(btrim(references_text), '') is not null
        or nullif(btrim(reference_exception), '') is not null
      )
    )
  );

alter table qbank_question_images drop constraint if exists qbank_question_images_transformation_history_array_check;
alter table qbank_question_images add constraint qbank_question_images_transformation_history_array_check
  check (content_transformation_history_valid(transformation_history));

alter table qbank_question_images drop constraint if exists qbank_question_images_approved_rights_complete_check;
alter table qbank_question_images add constraint qbank_question_images_approved_rights_complete_check
  check (
    distribution_rights_status not in ('original', 'licensed')
    or (
      nullif(btrim(distribution_rights_note), '') is not null
      and nullif(btrim(content_author), '') is not null
      and nullif(btrim(license_or_permission), '') is not null
      and nullif(btrim(permission_evidence_uri), '') is not null
      and permission_evidence_uri !~* '^data:'
      and jsonb_array_length(transformation_history) > 0
      and provenance_reviewed_at is not null
      and nullif(btrim(provenance_reviewer_role), '') is not null
    )
  );

alter table qbank_question_images drop constraint if exists qbank_question_images_quarantined_rights_complete_check;
alter table qbank_question_images add constraint qbank_question_images_quarantined_rights_complete_check
  check (
    distribution_rights_status <> 'quarantined'
    or (
      nullif(btrim(distribution_rights_note), '') is not null
      and provenance_reviewed_at is not null
      and nullif(btrim(provenance_reviewer_role), '') is not null
    )
  );

create table if not exists content_approval_batches (
  batch_id                  text primary key,
  manifest_sha256           text not null unique,
  approved_at               timestamptz not null,
  release_owner_role        text not null,
  legal_approval_record_id  text,
  question_count            int not null check (question_count >= 0),
  image_count               int not null check (image_count >= 0),
  applied_at                timestamptz not null default now(),
  check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  check (nullif(btrim(batch_id), '') is not null),
  check (nullif(btrim(release_owner_role), '') is not null),
  check (approved_at <= applied_at + interval '5 minutes')
);

alter table content_approval_batches enable row level security;
revoke all on table content_approval_batches from public, anon, authenticated;
grant select on table content_approval_batches to service_role;

create or replace function apply_content_approval_batch_v1(
  p_batch_id text,
  p_manifest_sha256 text,
  p_approved_at timestamptz,
  p_release_owner_role text,
  p_legal_approval_record_id text,
  p_questions jsonb,
  p_images jsonb
)
returns table(question_updates int, image_updates int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_count int;
  v_image_count int;
  v_question_updates int := 0;
  v_image_updates int := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'content approval batches require the service role';
  end if;
  if coalesce((select billing_required from billing_settings where id = true), false) then
    raise exception 'content approval batches are disabled while billing enforcement is active';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_typeof(p_images) <> 'array' then
    raise exception 'content approval payloads must be arrays';
  end if;
  v_question_count := jsonb_array_length(p_questions);
  v_image_count := jsonb_array_length(p_images);
  if v_question_count + v_image_count < 1 or v_question_count + v_image_count > 250 then
    raise exception 'content approval batch size is invalid';
  end if;
  if p_batch_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{3,119}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_release_owner_role), '') is null then
    raise exception 'content approval batch metadata is invalid';
  end if;

  update questions q set
    distribution_rights_status = x.distribution_rights_status,
    distribution_rights_note = x.distribution_rights_note,
    content_author = x.content_author,
    license_or_permission = x.license_or_permission,
    permission_evidence_uri = x.permission_evidence_uri,
    transformation_history = x.transformation_history,
    provenance_reviewed_at = x.provenance_reviewed_at,
    provenance_reviewer_role = x.provenance_reviewer_role,
    editorial_status = x.editorial_status,
    last_reviewed_at = x.last_reviewed_at,
    reviewer_role = x.reviewer_role,
    references_text = x.references_text,
    reference_exception = x.reference_exception,
    needs_review = x.needs_review
  from jsonb_to_recordset(p_questions) as x(
    qid int,
    expected_rights_status text,
    expected_editorial_status text,
    distribution_rights_status text,
    distribution_rights_note text,
    content_author text,
    license_or_permission text,
    permission_evidence_uri text,
    transformation_history jsonb,
    provenance_reviewed_at date,
    provenance_reviewer_role text,
    editorial_status text,
    last_reviewed_at date,
    reviewer_role text,
    references_text text,
    reference_exception text,
    needs_review boolean
  )
  where q.qid = x.qid
    and q.source <> 'user'
    and q.distribution_rights_status = x.expected_rights_status
    and q.editorial_status = x.expected_editorial_status;
  get diagnostics v_question_updates = row_count;
  if v_question_updates <> v_question_count then
    raise exception 'question approval state changed or a target is invalid';
  end if;

  update qbank_question_images qi set
    distribution_rights_status = x.distribution_rights_status,
    distribution_rights_note = x.distribution_rights_note,
    content_author = x.content_author,
    license_or_permission = x.license_or_permission,
    permission_evidence_uri = x.permission_evidence_uri,
    transformation_history = x.transformation_history,
    provenance_reviewed_at = x.provenance_reviewed_at,
    provenance_reviewer_role = x.provenance_reviewer_role
  from jsonb_to_recordset(p_images) as x(
    qid int,
    image_index int,
    expected_rights_status text,
    distribution_rights_status text,
    distribution_rights_note text,
    content_author text,
    license_or_permission text,
    permission_evidence_uri text,
    transformation_history jsonb,
    provenance_reviewed_at date,
    provenance_reviewer_role text
  )
  where qi.qid = x.qid
    and qi.image_index = x.image_index
    and qi.distribution_rights_status = x.expected_rights_status;
  get diagnostics v_image_updates = row_count;
  if v_image_updates <> v_image_count then
    raise exception 'image approval state changed or a target is invalid';
  end if;

  if exists (
    select 1
    from questions q
    join jsonb_to_recordset(p_questions) as x(qid int) on x.qid = q.qid
    where q.distribution_rights_status in ('original', 'licensed')
      and q.editorial_status = 'reviewed'
      and exists (
        select 1
        from qbank_question_images qi
        where qi.qid = q.qid
          and qi.distribution_rights_status not in ('original', 'licensed')
      )
  ) then
    raise exception 'an eligible question has an image without approved rights';
  end if;

  insert into content_approval_batches (
    batch_id,
    manifest_sha256,
    approved_at,
    release_owner_role,
    legal_approval_record_id,
    question_count,
    image_count
  ) values (
    p_batch_id,
    p_manifest_sha256,
    p_approved_at,
    p_release_owner_role,
    p_legal_approval_record_id,
    v_question_updates,
    v_image_updates
  );

  return query select v_question_updates, v_image_updates;
end;
$$;

revoke all on function apply_content_approval_batch_v1(text, text, timestamptz, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function apply_content_approval_batch_v1(text, text, timestamptz, text, text, jsonb, jsonb) to service_role;
