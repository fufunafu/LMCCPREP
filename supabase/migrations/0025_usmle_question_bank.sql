-- Store imported USMLE content with stable upstream identifiers and hashes.

alter table questions drop constraint if exists questions_source_check;
alter table questions
  add constraint questions_source_check
  check (source in ('canadaqbank', 'qbankmd', 'uworld_usmle', 'user'));

alter table questions
  add column if not exists source_external_id text,
  add column if not exists source_question_id text,
  add column if not exists source_content_hash text;

create unique index if not exists questions_source_external_id_unique
  on questions(source, source_external_id)
  where source_external_id is not null;

create unique index if not exists questions_source_content_hash_unique
  on questions(source, source_content_hash)
  where source_content_hash is not null;

-- The legacy corpus uses normalized stems as a duplicate guard. USMLE records
-- can legitimately share a generic or OCR-missing stem while differing in all
-- other content, so their two stable source keys enforce uniqueness instead.
drop index if exists questions_normalized_stem_unique_idx;
create unique index questions_normalized_stem_unique_idx
  on questions(regexp_replace(lower(stem), '[^a-z0-9]+', '', 'g'))
  where source not in ('user', 'uworld_usmle');

alter table questions drop constraint if exists questions_source_content_hash_check;
alter table questions
  add constraint questions_source_content_hash_check
  check (
    source_content_hash is null
    or source_content_hash ~ '^[0-9a-f]{64}$'
  );

comment on column questions.source_external_id is
  'Stable namespaced identifier supplied by an upstream content pipeline.';
comment on column questions.source_question_id is
  'Source-native question identifier. It is not required to be globally unique.';
comment on column questions.source_content_hash is
  'SHA-256 of the canonical source content used for idempotent imports.';

-- Preserve every record from each local source dataset, not only the merged
-- canonical question selected for the learner-facing questions table.
create table if not exists usmle_source_records (
  dataset                 text not null check (dataset in ('pdf', 'screenshots', 'combined')),
  record_index            int not null check (record_index >= 0),
  canonical_qid           int references questions(qid) on delete set null,
  external_id             text not null,
  source_question_id      text not null,
  subject                 text not null,
  stem                    text not null,
  options                 jsonb not null,
  answer_index            int not null,
  correct_answer          text,
  explanation             jsonb not null,
  educational_objective   text not null,
  references_json         jsonb not null,
  has_figure              boolean not null,
  needs_review            boolean not null,
  review_issues           jsonb not null,
  source                  text not null,
  source_files            jsonb not null,
  content_hash            text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  record_sha256           text not null check (record_sha256 ~ '^[0-9a-f]{64}$'),
  distribution_rights_status text not null default 'unverified'
    constraint usmle_source_records_distribution_rights_status_check
    check (distribution_rights_status in ('original', 'licensed', 'unverified', 'quarantined')),
  source_raw              jsonb not null,
  imported_at             timestamptz not null default now(),
  primary key (dataset, record_index),
  unique (dataset, external_id, content_hash)
);
create index if not exists usmle_source_records_canonical_qid_idx
  on usmle_source_records(canonical_qid);
create index if not exists usmle_source_records_question_id_idx
  on usmle_source_records(source_question_id);

-- Record the exact local JSON artifacts and keep independently verifiable
-- copies in private Supabase Storage.
create table if not exists usmle_import_artifacts (
  artifact_name    text primary key,
  relative_path    text not null unique,
  storage_bucket   text not null,
  storage_path     text not null unique,
  mime_type        text not null,
  byte_length      bigint not null check (byte_length >= 0),
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  record_count     int,
  distribution_rights_status text not null default 'unverified'
    constraint usmle_import_artifacts_distribution_rights_status_check
    check (distribution_rights_status in ('original', 'licensed', 'unverified', 'quarantined')),
  metadata         jsonb not null default '{}'::jsonb,
  imported_at      timestamptz not null default now()
);

-- Inventory every PNG in the figures directory. Manifested assets remain in
-- qbank_question_images for the player. Non-manifested source artifacts stay
-- available to the admin/service layer without appearing in learner sessions.
create table if not exists usmle_figure_assets (
  filename                    text primary key,
  canonical_qid               int references questions(qid) on delete set null,
  external_id                 text,
  image_index                 int,
  manifested                  boolean not null,
  included_in_question_player boolean not null,
  storage_bucket              text not null,
  storage_path                text not null unique,
  mime_type                   text not null,
  byte_length                 bigint not null check (byte_length > 0),
  sha256                      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  source_path                 text not null,
  distribution_rights_status text not null default 'unverified'
    constraint usmle_figure_assets_distribution_rights_status_check
    check (distribution_rights_status in ('original', 'licensed', 'unverified', 'quarantined')),
  manifest_data               jsonb,
  imported_at                 timestamptz not null default now()
);
create index if not exists usmle_figure_assets_canonical_qid_idx
  on usmle_figure_assets(canonical_qid);

alter table usmle_source_records enable row level security;
alter table usmle_import_artifacts enable row level security;
alter table usmle_figure_assets enable row level security;
revoke all on usmle_source_records from public, anon, authenticated;
revoke all on usmle_import_artifacts from public, anon, authenticated;
revoke all on usmle_figure_assets from public, anon, authenticated;
grant select on usmle_source_records to service_role;
grant select on usmle_import_artifacts to service_role;
grant select on usmle_figure_assets to service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'usmle-source-artifacts', 'usmle-source-artifacts', false, 52428800,
  array['application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
