# Reviewed question-bank release runbook

Status: required procedure. No Production write is authorized by this document.

## Current baseline

- Production contains 4,972 questions and migrations through `0019_enforce_paid_content_approval`.
- Application and database billing enforcement are off.
- The reviewed local result contains 4,036 survivors after 1,397 corrections and 936 duplicate removals.
- Migration `0020_atomic_content_approval_workflow.sql`, the reviewed corrections, and migration `0021_remove_reviewed_duplicate_questions.sql` are not applied to Production.
- The expected post-release content identity is `a2c57cab96ec1000c2e118cb04931435d97c233e8ca9f2ff4a450012e7a0366f`.

## Hard preconditions

Do not continue unless every item below is recorded in the release ticket:

1. A reviewed commit contains the correction tooling, migration `0021`, this runbook, and no unrelated worktree changes.
2. A fresh database backup or verified point-in-time recovery target exists. Record its identifier without credentials or user data.
3. Both billing switches are confirmed false.
4. Migration `0020` and migration `0021` have independent database and security approval.
5. The ignored `audit-output` directory is mode 0700 and its files are mode 0600.
6. The source snapshot hash and stable content hash match `QUESTION_BANK_AUDIT_COMPLETE.md`.
7. The linked Supabase project reference is recorded and independently checked by the release owner.

## Local and staging verification

Run from `web/`:

```bash
npm run content:bank:build
npm run content:bank:verify
npm run test:migration:dedup
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
```

Test migrations `0020` and `0021` against a disposable production-like database. Save only aggregate results and identifiers. Do not save service keys, question text, user identifiers, database error payloads, or stack traces in the release ticket.

## Production correction dry runs

With the Production service-role environment loaded locally, dry-run the correction batches in this order. Replace `<project-ref>` with the exact linked project reference. The command refuses a mismatched project.

```bash
node scripts/apply-question-review-corrections.mjs audit-output/deterministic-rationale-corrections-v1.json --project <project-ref> --skip-deletions
node scripts/apply-question-review-corrections.mjs audit-output/full-bank-medical-corrections-v1.json --project <project-ref> --skip-deletions
node scripts/apply-question-review-corrections.mjs audit-output/semantic-duplicate-resolutions-v1.json --project <project-ref> --skip-deletions
node scripts/apply-question-review-corrections.mjs audit-output/targeted-medical-corrections-v2.json --project <project-ref> --skip-deletions
node scripts/apply-question-review-corrections.mjs audit-output/rapid-model-corrections-v1.json --project <project-ref> --skip-deletions
```

Review every dry-run summary. The importer writes owner-only local backups and hash-only change reports. Stop if a question matches neither its reviewed before state nor its reviewed corrected state.

## Authorized application sequence

Proceed only after the release owner explicitly approves the reviewed commit, backup identifier, dry-run reports, and maintenance window.

1. Keep both billing switches false.
2. Apply each correction batch in the dry-run order, adding `--apply --confirm APPLY_QUESTION_CORRECTIONS --skip-deletions` to the exact reviewed command.
3. Re-run each batch as a dry run. Every correction must report as already applied with no divergent rows.
4. Apply the approved tracked migrations through the documented Supabase CLI flow. If Production is at `0019`, this applies `0020` before `0021`. Do not paste edited SQL into the dashboard.
5. Run `npm run content:dedup:verify-production`. It must report 4,036 Production questions, zero content mismatches, zero removed-qid references, zero exact normalized-stem duplicates, and the expected stable content hash.
6. Run `npm run security:verify`, `npm run content:inventory`, and the Production browser smoke suite.
7. Record migration identifiers, aggregate verification output, reviewed commit, deployment identifier, and backup identifier. Keep all secret values and item text out of the record.

## Failure and rollback

- Before migration `0021`, stop on any correction mismatch and repair forward from the owner-only batch backup or restore the verified database backup.
- After migration `0021`, an application deployment rollback does not restore deleted duplicate rows or merged dependencies. Restore the recorded database backup or execute a separately reviewed forward-recovery migration.
- Keep billing off throughout rollback and repeat authorization, inventory, content-identity, and browser smoke checks afterward.
- Never improvise a partial reverse migration in Production.
