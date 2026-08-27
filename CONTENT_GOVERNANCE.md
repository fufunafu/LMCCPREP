# Content governance and paid-distribution gate

Status: required operating procedure for the private beta and any future paid launch.

This document defines the minimum evidence for changing a question or clinical image from unverified review material into content that may be counted publicly or delivered through paid access. It does not itself grant rights, approve medical content, or replace legal advice.

## Non-negotiable release rule

Paid access must remain disabled until all intended launch items satisfy both gates below and qualified counsel has approved the distribution model.

1. Rights gate: the question and every attached image are `original` or `licensed`, with evidence recorded.
2. Editorial gate: the question is `reviewed`, with a current Canadian reference or documented exception and a recorded reviewer role and review date.

Migration `0019_enforce_paid_content_approval.sql` enforces these rules when database billing enforcement is enabled. It also excludes every other item from public catalog totals. Personal questions remain visible only to their author and never count as reviewed bank content.

## Required question inventory fields

Every bank question must have:

- stable `qid` and source identifiers;
- source category, subject, topic, and source pages where applicable;
- `content_author` or the best available rights-holder attribution;
- `license_or_permission`, including the grant type and relevant scope;
- a private `permission_evidence_uri` pointing to the signed agreement, license, or original-work record;
- `transformation_history`, as ordered entries recording date, responsible role, action, and source or review artifact hash;
- `distribution_rights_status` and a concise `distribution_rights_note`;
- `provenance_reviewed_at` and `provenance_reviewer_role`;
- `editorial_status`, `last_reviewed_at`, and `reviewer_role`;
- approved reference text or a documented `reference_exception`.

The same rights, author, permission, evidence, transformation, and provenance-review fields are required independently for every row in `qbank_question_images`. Approval of a question does not approve its images.

## Rights status rules

- `unverified`: default. Evidence is incomplete or has not been reviewed. Never available through paid enforcement.
- `quarantined`: evidence is absent, contradictory, expired, outside the intended distribution scope, or rejected by counsel. Never available through paid enforcement.
- `original`: the company owns the content or has a documented work-for-hire or assignment record covering paid digital distribution.
- `licensed`: written permission or a license explicitly covers the intended paid digital distribution, geography, duration, transformations, and clinical-image use where applicable.

Do not infer permission from private-beta access, attribution, educational purpose, public availability, purchase of source access, or transformation. Do not store contracts, personal contact details, or secret URLs in Git. The evidence URI belongs in protected operational storage.

## Editorial standard

Set `editorial_status=reviewed` only after a qualified clinical reviewer confirms all of the following:

- the stem is clinically coherent and contains the information needed to answer;
- exactly one option is the best answer under the stated scenario;
- distractors are plausible but not equally correct;
- the explanation supports the keyed answer and explains the important distinctions;
- claims are consistent with current Canadian practice, terminology, and guideline context;
- references are authoritative, current enough for the topic, and directly support the answer;
- the item is mapped to the correct MCCQE discipline and relevant blueprint dimensions;
- figures are necessary, readable, accurately described, and separately rights-approved;
- no answer-derived learner-visible tag or other pre-attempt field reveals the answer;
- no patient, learner, author, or reviewer personal information is present.

Prefer current Canadian national or provincial guidance, recognized Canadian professional bodies, peer-reviewed evidence, and authoritative drug or public-health references. When Canadian guidance is unavailable, record why another source is appropriate and whether Canadian practice differs.

Use a reviewer role that communicates qualification without exposing a person's identity publicly. A bank item should ordinarily be reviewed by a Canadian-licensed physician or another regulated clinician with appropriate subject expertise. Conflicts and reviewer identity should remain in the protected editorial record.

## Currency and re-review

- Record `last_reviewed_at` for every reviewed item.
- Re-review at least annually, and sooner for changing guidelines, drug safety, screening, immunization, resuscitation, infectious disease, obstetric, public-health, or legal and ethical topics.
- Set `editorial_status=stale` immediately when a material guideline change, safety concern, unresolved report, or reference withdrawal could affect the answer.
- Quarantine an item when a credible safety issue cannot be resolved promptly.

## Review workflow

1. Run `npm run content:inventory`. Keep the generated file local and access-controlled; it is intentionally ignored by Git and deployment uploads.
2. Assign a rights disposition to each question and image. Attach evidence outside the repository and record only its protected URI and a concise note.
3. Record each transformation as a new history entry. Do not overwrite prior history.
4. Complete medical review, references, blueprint mapping, and reviewer metadata.
5. Have a second reviewer or release owner verify that all required fields are present and internally consistent.
6. Copy `scripts/content-approvals.example.json` to a private, access-controlled location and prepare an approval batch of no more than 250 question and image records. Do not store evidence documents, private evidence URLs, reviewer identities, or completed manifests in Git.
7. Run `npm run content:approvals -- --file /private/path/content-approval-batch.json`. The dry run validates target state, complete rights metadata, transformation artifact hashes, editorial metadata, references, and image approval dependencies without changing the database.
8. After the release owner approves the dry-run summary, apply the same immutable manifest with `npm run content:approvals -- --file /private/path/content-approval-batch.json --apply --confirm APPLY_CONTENT_APPROVALS`. Migration `0020_atomic_content_approval_workflow.sql` rejects incomplete metadata, refuses updates while billing enforcement is active, applies each batch atomically, and records the manifest hash in the service-only approval ledger.
9. Regenerate the inventory and compare counts and hashes with the approved review batch. Reversals must use a new reviewed manifest with the current expected state, preserving the original batch record.
10. Run `npm run security:verify`, the full quality gate, and the production smoke suite.
11. Obtain written counsel approval of the content-licensing model before enabling paid access.

## Release evidence

The release record must contain, without secret values or personal data:

- reviewed commit and deployment identifiers;
- applied migration identifiers;
- inventory generation timestamp and aggregate counts by rights and editorial status;
- question and image counts included in the paid corpus;
- reviewer-role and review-date completeness counts;
- reference and exception completeness counts;
- the legal approval record identifier and approval date;
- verification command results and rollback record.

If any evidence is missing or contradictory, keep billing enforcement off and treat the affected item as unverified or quarantined.
