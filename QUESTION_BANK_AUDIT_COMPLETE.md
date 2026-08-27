# LMCC question-bank audit completion record

Status: complete for the fixed source snapshot. Production publication is not approved.

Completion date: 2026-08-26

## Scope

The medical and structural review is complete for the authoritative 4,972-question source snapshot below. This record does not establish distribution rights, counsel approval, item-level editorial approval, or authorization to modify Production.

- Source: ignored local file `audit-output/question-review-snapshot.json`
- Source questions: 4,972
- Source SHA-256: `8f1ac3bca970f294fad00605a91194fac31c76c95be3655bfab6d4bba31c2b6f`
- Retained nonduplicate questions: 4,036
- Reviewed corrections: 1,397
- Confirmed duplicate removals: 936
- Ambiguous survivors retained and flagged: 224
- Exact normalized-stem duplicates: 0
- Unresolved likely or exact semantic duplicates: 0
- Structural failures: 0

The reproducible final-bank content SHA-256 is:

`a2c57cab96ec1000c2e118cb04931435d97c233e8ca9f2ff4a450012e7a0366f`

This content hash excludes only the generation timestamp. The builder also synchronizes `answer_key`, `key_points`, and `option_explanations` with every reviewed correction so redundant learner-support fields cannot retain stale answer text. The strict verifier replays the same normalization and binds the result to every source artifact.

## Canonical private artifacts

The following files are intentionally ignored by Git and must remain owner-readable only:

- `audit-output/question-review-snapshot.json`
- `audit-output/full-corpus-review-v1.json`
- `audit-output/question-semantic-audit-preview.json`
- `audit-output/semantic-duplicate-resolutions-v1.json`
- `audit-output/full-deduplicated-question-bank.json`
- `audit-output/full-deduplicated-question-bank-report.json`

The tracked verifier and builder are:

- `scripts/build-full-deduplicated-question-bank.mjs`
- `scripts/verify-full-deduplicated-question-bank.mjs`
- `scripts/test-reviewed-deduplication-migration.mjs`
- `supabase/migrations/0021_remove_reviewed_duplicate_questions.sql`

## Reproduction

Run from `web/`:

```bash
npm run content:bank:build
npm run content:bank:verify
npm run test:migration:dedup
```

The strict verifier must pass without `--allow-incomplete`, report 4,036 retained questions, and reproduce the content hash above. The migration test must report 936 mappings, preserved dependencies, and a passing unapproved-image guard.

## Rerun conditions

Repeat the full review only when at least one condition is true:

- the source snapshot hash changes;
- questions are added or materially changed outside the reviewed correction set;
- a correction, deletion, consolidated review, or semantic decision artifact changes;
- the strict verifier fails or the stable content hash changes unexpectedly;
- a guideline-currency refresh is requested;
- the user explicitly requests a new review.

Applying the reviewed result to Production is a separate operation. Follow `QUESTION_BANK_RELEASE_RUNBOOK.md`, keep billing disabled, and obtain explicit release-owner authorization before any write.
