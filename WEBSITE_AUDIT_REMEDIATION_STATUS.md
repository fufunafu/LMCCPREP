# Website audit remediation status

Last verified: 2026-08-26

## Release decision

The private beta is operational and billing enforcement remains off. A paid public launch is not approved. The remaining blockers require content-owner, editorial, legal, branding, and live-billing decisions that cannot be satisfied by application code alone.

## Production baseline

- Canonical public origin: `https://lmcc-prep.vercel.app`
- Baseline deployment before the final accessibility and PWA delta: `dpl_Gq1hajW4xPKNM81xFakZh7nXAnRu`
- Baseline source commit: `c9e3efd`
- Deployment state: Ready and promoted to Production
- Supabase migration ledger: every tracked migration from `0001_schema` through `0018_enforce_answer_safe_tags` is applied in order
- Database billing setting: `billing_required=false`, `grace_days=3`
- Application billing setting: disabled for the private beta
- Production capture route: disabled unless `CAPTURE_ENABLED=true` is explicitly configured
- Production environment inventory is limited to variable names in deployment metadata. No secret values are recorded here.

## Completed remediation

- Current MCCQE naming is used across product and public copy, with the former exam name retained once for search clarity.
- The public site clearly describes the current five-discipline reviewed scope and does not claim Obstetrics and Gynecology coverage.
- Timed mode uses 83 seconds per question and supports a 115-question section simulation.
- Session creation and sign-out return explicit client navigation targets, preventing successful redirects from being reported as failures.
- Public subject counts use an anonymous aggregate source with a matching cached fallback and do not depend on demo or account state.
- Demo totals, accuracy, remaining counts, activity dates, topic statistics, and session summaries derive from one consistent fixture.
- Learner-visible tags no longer receive correct-answer text. Migration `0018` also removes the normalized answer tag after inserts and edits to options or answer indexes.
- Rights, editorial status, references, reviewer role, review date, and documented exceptions are modeled and shown after answer submission.
- The capture route fails closed by default, limits requests to 128 KiB, and avoids logging database messages or payloads.
- Access requests use a honeypot, normalized-email deduplication, and a one-request-per-network-fingerprint-per-hour limit. Public database inserts are revoked.
- CSP, HSTS, frame denial, MIME protection, referrer policy, permissions policy, `robots.txt`, `sitemap.xml`, canonical metadata, route metadata, and structured data are implemented.
- The PWA opens logged-out users at sign-in, supports portrait and landscape, and caches only the offline shell assets.
- Skip navigation, one-main-landmark routing, active navigation state, answer-letter preservation, mobile and desktop question state, reduced motion, and focus placement are implemented.
- Analytics charts and the activity heatmap have screen-reader tables, while the decorative chart surfaces are removed from the accessibility tree.
- The free no-card demo is prominent in the hero and pricing areas. Annual dollar and percentage savings, renewal, cancellation, tax, and refund copy are adjacent to pricing.
- Draft legal pages disclose their draft status, version, operator, account deletion path, processors, cancellation behavior, and remaining counsel requirement.

## Verification evidence

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test:unit`: 87 passed
- `npm run build`: passed
- Focused accessibility regression: 3 passed
- Production-like authorization verifier: passed anonymous access, service-only RPC, cross-user study data, and cross-user billing data checks; temporary users were deleted afterward
- Production schema probes confirmed the provenance and access-request columns
- Production aggregate audit: 4,972 questions total, 4,972 rights-unverified, 0 rights-approved, 0 editorially reviewed, 3,826 with reference text, and 0 with a reference exception
- Production response check confirmed the enforced CSP and the promoted deployment identifier

## Paid-launch blockers

1. Every one of the 4,972 questions remains rights-unverified. Written permission, a source inventory, transformation history, and item-level disposition are required before paid distribution.
2. No question is currently marked editorially reviewed. References alone do not establish medical approval or Canadian guideline currency.
3. Qualified counsel has not approved the Terms, Privacy notice, Refund policy, paid subscription flow, or content-licensing model.
4. The product still uses a Vercel hostname and a personal support address. A branded domain, monitored branded support address, and approved response-time commitment are required.
5. A real reviewed and referenced sample explanation cannot be marketed until at least one item passes the editorial and rights gates.
6. Manual keyboard, screen-reader, 200 percent zoom, and maskable-icon safe-zone checks still require a human verification record.
7. Full Stripe payment lifecycle testing, matching live resources, staged enforcement, rollback rehearsal, and 48-hour monitoring remain tracked in the billing launch documents.

## Release and rollback procedure

1. Keep both application and database billing enforcement off until every paid-launch blocker is closed.
2. Deploy only a clean reviewed commit and record its deployment ID here.
3. Run the complete local browser suite and the canonical Production public, demo, metadata, header, capture, and authorization smoke checks.
4. If a regression appears, promote baseline deployment `dpl_Gq1hajW4xPKNM81xFakZh7nXAnRu` and keep billing enforcement off.
5. Re-run the smoke suite after any promotion or rollback.
