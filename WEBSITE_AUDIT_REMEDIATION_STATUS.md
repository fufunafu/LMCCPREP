# Website audit remediation status

Last verified: 2026-08-26

## Release decision

The private beta is operational and billing enforcement remains off. A paid public launch is not approved. The remaining blockers require content-owner, editorial, legal, branding, and live-billing decisions that cannot be satisfied by application code alone.

The next reviewed release candidate also contains migration `0019_enforce_paid_content_approval.sql`. It makes public counts include only rights-approved, editorially reviewed questions and makes paid access fail closed for unapproved questions and images. The migration passed a linked dry run but has not been applied because production policy changes require explicit owner approval.

## Production baseline

- Canonical public origin: `https://lmcc-prep.vercel.app`
- Baseline deployment before the final accessibility and PWA delta: `dpl_Gq1hajW4xPKNM81xFakZh7nXAnRu`
- Baseline source commit: `c9e3efd`
- Deployment state: Ready and promoted to Production
- Supabase migration ledger: migrations `0001_schema` through `0018_enforce_answer_safe_tags` are applied in order; candidate migration `0019_enforce_paid_content_approval` is pending explicit production approval
- Database billing setting: `billing_required=false`, `grace_days=3`
- Application billing setting: disabled for the private beta
- Production capture route: disabled unless `CAPTURE_ENABLED=true` is explicitly configured
- Production environment inventory is limited to variable names in deployment metadata. No secret values are recorded here.

## Completed remediation

- Current MCCQE naming is used across product and public copy, with the former exam name retained once for search clarity.
- The public site clearly describes the current five-discipline reviewed scope and does not claim Obstetrics and Gynecology coverage.
- Timed mode uses 83 seconds per question and supports a 115-question section simulation.
- Session creation and sign-out return explicit client navigation targets, preventing successful redirects from being reported as failures.
- Public subject counts use an anonymous aggregate source with a matching cached fallback and do not depend on demo or account state. Candidate migration `0019` and the zero-count fallback additionally prevent unapproved content from contributing to public totals.
- Demo totals, accuracy, remaining counts, activity dates, topic statistics, and session summaries derive from one consistent fixture.
- Learner-visible tags no longer receive correct-answer text. Migration `0018` also removes the normalized answer tag after inserts and edits to options or answer indexes.
- Rights, editorial status, references, reviewer role, review date, and documented exceptions are modeled and shown after answer submission.
- The capture route fails closed by default, limits requests to 128 KiB, and avoids logging database messages or payloads.
- Access requests use a honeypot, normalized-email deduplication, and a one-request-per-network-fingerprint-per-hour limit. Public database inserts are revoked.
- CSP, HSTS, frame denial, MIME protection, referrer policy, permissions policy, `robots.txt`, `sitemap.xml`, canonical metadata, route metadata, and structured data are implemented.
- The PWA opens logged-out users at sign-in, supports portrait and landscape, and caches only the offline shell assets.
- The maskable PWA icon is generated from a full-bleed 512 px source. Its rendered PNG is fully opaque, and the foreground remains inside the standard central safe circle.
- Skip navigation, one-main-landmark routing, active navigation state, answer-letter preservation, mobile and desktop question state, reduced motion, and focus placement are implemented.
- Analytics charts and the activity heatmap have screen-reader tables, while the decorative chart surfaces are removed from the accessibility tree.
- The free no-card demo is prominent in the hero and pricing areas. Annual dollar and percentage savings, renewal, cancellation, tax, and refund copy are adjacent to pricing.
- Draft legal pages disclose their draft status, version, operator, account deletion path, processors, cancellation behavior, and remaining counsel requirement.

## Verification evidence

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test:unit`: 89 passed
- `npm run build`: passed
- Standard browser suite: 20 passed and 2 intentionally skipped live-Supabase checks
- Billing browser suite: 5 passed
- Billing rollback browser gate: 1 passed
- Production-like authorization verifier before the new public-count assertion: passed 4,972 answer-safe rows, anonymous access, service-only RPC, cross-user study data, and cross-user billing data checks; temporary users were deleted afterward
- The updated authorization verifier also compares every public discipline total with the rights-approved and editorially reviewed corpus. That new assertion remains pending until migration `0019` is approved and applied.
- Production schema probes confirmed the provenance and access-request columns
- A local-only, mode-0600 provenance inventory now contains all 4,972 production questions and 89 clinical images without question text, answer text, or secret values. Current result: 4,972 rights-unverified and editorially pending questions, plus 89 rights-unverified images. The candidate schema adds structured author, license or permission, evidence, transformation-history, and provenance-review fields to question and image records.
- Production aggregate audit: 4,972 questions total, 4,972 rights-unverified, 0 rights-approved, 0 editorially reviewed, 3,826 with reference text, and 0 with a reference exception
- Maskable-icon render check: 512 by 512, 0 non-opaque pixels, foreground bounds 121 through 390 on both axes, maximum foreground radius 134.77 px inside the 204.8 px safe radius
- Production response check confirmed the enforced CSP and the promoted deployment identifier

## Paid-launch blockers

1. Migration `0019` requires explicit approval before it can change the production content policies and public counts. Until it is applied, the live aggregate still counts unapproved content, so this candidate must not be deployed as though those totals were approved.
2. Every one of the 4,972 questions and all 89 clinical images remain rights-unverified. Written permission, completed structured provenance fields, transformation history, and item-level disposition are required before paid distribution.
3. No question is currently marked editorially reviewed. References alone do not establish medical approval or Canadian guideline currency.
4. Qualified counsel has not approved the Terms, Privacy notice, Refund policy, paid subscription flow, or content-licensing model.
5. The product still uses a Vercel hostname and a personal support address. A branded domain, monitored branded support address, and approved response-time commitment are required.
6. A real reviewed and referenced sample explanation cannot be marketed until at least one item passes the editorial and rights gates.
7. Manual keyboard, screen-reader, and 200 percent zoom checks still require a human verification record. The maskable-icon safe-zone check is complete.
8. Full Stripe payment lifecycle testing, matching live resources, staged enforcement, rollback rehearsal, and 48-hour monitoring remain tracked in the billing launch documents.

## Release and rollback procedure

1. Keep both application and database billing enforcement off until every paid-launch blocker is closed.
2. Obtain explicit approval, apply migration `0019`, rerun `npm run content:inventory` until it reports `schema_complete: true`, and rerun `npm run security:verify`.
3. Deploy only a clean reviewed commit and record its deployment ID here.
4. Run the complete local browser suite and the canonical Production public, demo, metadata, header, capture, and authorization smoke checks.
5. If a regression appears, keep `billing_required=false`, promote baseline deployment `dpl_Gq1hajW4xPKNM81xFakZh7nXAnRu`, and repair forward. With billing off, migration `0019` preserves current private-beta question access.
6. Re-run the smoke suite after any promotion or rollback.
