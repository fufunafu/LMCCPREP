# Website audit remediation status

Last verified: 2026-08-26

## Release decision

The private beta is operational and billing enforcement remains off. A paid public launch is not approved. The remaining blockers require content-owner, editorial, legal, branding, accessibility, and live-billing decisions that cannot be satisfied by application code alone.

Migration `0019_enforce_paid_content_approval.sql` was explicitly approved and applied to production on 2026-08-26. It makes public counts include only rights-approved, editorially reviewed questions and makes paid access fail closed for unapproved questions and images. The exact release candidate at commit `25d717a` is Ready in Preview and reports zero approved questions, matching the current inventory. Production still serves commit `6331f1e`; its cached homepage was observed showing the pre-migration total as approved content, so the candidate must be promoted and smoke-tested before production is considered aligned.

## Production baseline

- Canonical public origin: `https://lmcc-prep.vercel.app`
- Current Production deployment: `dpl_9CDyDhxqKzYLqtTNkuu82rWM3nhU`
- Current Production source commit: `6331f1e`
- Current Production state: Ready, but not aligned with the approved-count release candidate
- Reviewed release-candidate Preview: `dpl_GF3ctwKhh2ECE7QBLCeFWjn6U6qc` at `https://lmcc-prep-83ls1imp6-fuannes-projects.vercel.app`
- Release-candidate source commit: `25d717a315fffe52203c7913ee0665eaf571ae53`
- Supabase migration ledger: migrations `0001_schema` through `0019_enforce_paid_content_approval` are applied in order and match the tracked files
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
- `CONTENT_GOVERNANCE.md` defines the item-level rights evidence, separate image review, transformation history, Canadian editorial standard, re-review cadence, and release record required before any item becomes paid-distributable.
- The capture route fails closed by default, limits requests to 128 KiB, and avoids logging database messages or payloads.
- Access requests use a honeypot, normalized-email deduplication, and a one-request-per-network-fingerprint-per-hour limit. Public database inserts are revoked.
- CSP, HSTS, frame denial, MIME protection, referrer policy, permissions policy, `robots.txt`, `sitemap.xml`, canonical metadata, route metadata, and structured data are implemented.
- The PWA opens logged-out users at sign-in, supports portrait and landscape, and caches only the offline shell assets.
- The maskable PWA icon is generated from a full-bleed 512 px source. Its rendered PNG is fully opaque, and the foreground remains inside the standard central safe circle.
- Skip navigation, one-main-landmark routing, active navigation state, answer-letter preservation, mobile and desktop question state, reduced motion, and focus placement are implemented.
- Analytics charts and the activity heatmap have screen-reader tables, while the decorative chart surfaces are removed from the accessibility tree.
- The free no-card demo is prominent in the hero and pricing areas. Annual dollar and percentage savings, renewal, cancellation, tax, and refund copy are adjacent to pricing.
- Public sign-in and Billing surfaces no longer claim a larger or complete corpus. The purchase surface names the five available disciplines, discloses that Obstetrics and Gynecology is absent, and promises only rights-approved, reviewed questions.
- Draft legal pages disclose their draft status, version, operator, account deletion path, processors, cancellation behavior, and remaining counsel requirement.

## Verification evidence

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test:unit`: 89 passed
- `npm run build`: passed
- Standard browser suite: 22 passed and 2 intentionally skipped live-Supabase checks
- Canonical Production browser suite after migration `0019`: 22 passed and 2 intentionally skipped live-Supabase checks. The suite verifies cross-state equality but does not assert the expected zero approved total, so the direct aggregate and page checks remain required.
- Billing browser suite: 5 passed
- Billing rollback browser gate: 1 passed
- Local billing readiness rerun: 24 of 27 checks passed, with the three expected local failures caused by intentionally absent Stripe secret and webhook values. The previously recorded protected-Preview preflight remains 37 of 37.
- Post-migration database authorization verifier: passed approved public counts, 4,972 answer-safe tag rows, anonymous access, service-only RPC, cross-user study data, and cross-user billing data checks; temporary users were deleted afterward
- The verifier now also requires the published five-discipline values to equal the approved production RPC. Its current Production run fails closed before creating temporary users because the old deployment does not expose the verified catalog markers. The local marker and cross-state regression passes.
- Production schema probes confirmed the provenance and access-request columns
- A local-only, mode-0600 provenance inventory generated after migration `0019` contains all 4,972 production questions and 89 clinical images without question text, answer text, or secret values. It reports `schema_complete: true`, 4,972 rights-unverified and editorially pending questions, plus 89 rights-unverified images. The schema includes structured author, license or permission, evidence, transformation-history, and provenance-review fields for questions and images.
- Production aggregate audit: 4,972 questions total, 4,972 rights-unverified, 0 rights-approved, 0 editorially reviewed, 3,826 with reference text, and 0 with a reference exception
- Maskable-icon render check: 512 by 512, 0 non-opaque pixels, foreground bounds 121 through 390 on both axes, maximum foreground radius 134.77 px inside the 204.8 px safe radius
- Manual browser keyboard smoke: the skip link is the first focus target on public and private shells, Enter moves focus to `main-content`, focus indication is visible, and the active mobile Dashboard destination exposes `aria-current="page"`.
- 200 percent equivalent reflow check: the homepage and demo dashboard were inspected at a 640 CSS px viewport, equivalent to 200 percent zoom on a 1,280 px desktop viewport. Both had `scrollWidth === clientWidth` and retained readable, operable layouts without horizontal page overflow.
- The public-link crawl passes, every indexable route has a unique title, description, Open Graph title and description, canonical URL, and Open Graph URL, and structured data has the required Organization, WebSite, SoftwareApplication, Offer, and FAQ shapes.
- Header verification passes for HTML, the disabled capture API, the service worker, and the generated PNG icon. Tablet landscape plus 1,280 px and 1,920 px desktop layout checks pass without page overflow; the existing suite also covers 375 by 812 and 390 by 844 mobile viewports.
- Production response check confirmed the enforced CSP and the promoted deployment identifier
- The exact `25d717a` Preview reports zero approved questions, has one main landmark, no horizontal overflow, a visible simulated-data disclosure, active navigation state, and successful demo session creation without a false failure toast.
- The current Production homepage was observed showing 4,545 approved questions from its pre-migration cached render. This contradicts the post-migration inventory and must be cleared by the reviewed candidate promotion and production smoke test.

## Final launch checklist audit

| Plan requirement | Status | Authoritative evidence |
| --- | --- | --- |
| Content rights and provenance approved | Not met | The post-migration inventory reports 4,972 unverified questions and 89 unverified images. |
| Current MCCQE name and scope used throughout | Met in the candidate | Public copy, metadata, and the browser suite use the current name and five-discipline scope. |
| Obstetrics and Gynecology included or limitation clearly disclosed | Met by disclosure | The homepage, sign-in, and Billing surfaces state that Obstetrics and Gynecology is not included. |
| Migration `0013` tracked and applied | Met | The tracked migration matches the production ledger, which now runs through `0019`. |
| Cross-user authorization tests passing | Met | The post-migration production authorization verifier passed study-data and billing isolation checks. |
| Session creation produces no false error | Met in the candidate | Regression coverage passes, and the exact Preview opens a demo session without the failure toast. |
| Public counts independent of login and demo state | Candidate verified, Production pending | Local regression coverage passes and the prior Preview reports zero approved questions. The strengthened release verifier fails against current Production until a deployment publishes the verified markers and zero counts. |
| Demo metrics and dates consistent | Met | The shared fixture tests pass, and the Preview dashboard reconciles 20 completed plus 10 remaining with 30 total on the current Toronto date. |
| Correct answers absent from pre-attempt tags | Met | Unit coverage and the production authorization verifier pass all 4,972 answer-safe rows. |
| Medical references and review status visible | Implementation met, content gate not met | The UI and schema support references and review status, but only 3,826 questions have reference text, none has an approved exception, and none is editorially reviewed. |
| Sticky marketing navigation repaired | Met | The targeted anchor and sticky-header browser regression passes. |
| Robots, sitemap, canonical URLs, and structured data live | Met | Production response checks and the public metadata and link crawl pass. |
| Site-wide CSP and public-endpoint abuse controls live | Met | Production header checks pass, and access-request abuse controls are tracked and tested. |
| Capture endpoint disabled by default in production | Met | The deployed endpoint returns HTTP 404 without permissive cross-origin access. |
| Accessibility remediation and manual testing complete | Not met | Automated serious-issue gates, keyboard checks, reflow, responsive layouts, and icon review pass. A human screen-reader smoke record is still missing. |
| Branded domain and support email live | Not met | The canonical origin remains a Vercel hostname and support uses an approved personal address rather than a branded address. |
| Legal and privacy pages approved | Not met | Draft disclosures are implemented, but qualified counsel has not approved the launch versions or licensing model. |
| Full automated and manual release gates passing | Not met | Current local code gates pass, but the strengthened published-count gate fails against current Production. Candidate Production smoke, the human screen-reader check, and remaining Stripe lifecycle work are outstanding. |
| Production rollback procedure verified | Partially met | The isolated rollback browser gate passes and a known baseline deployment is recorded, but a Production rollback rehearsal has not been completed. |

## Paid-launch blockers

1. Every one of the 4,972 questions and all 89 clinical images remain rights-unverified. Written permission, completed structured provenance fields, transformation history, and item-level disposition are required before paid distribution.
2. No question is currently marked editorially reviewed. References alone do not establish medical approval or Canadian guideline currency.
3. Qualified counsel has not approved the Terms, Privacy notice, Refund policy, paid subscription flow, or content-licensing model.
4. The product still uses a Vercel hostname and a personal support address. A branded domain, monitored branded support address, and approved response-time commitment are required.
5. A real reviewed and referenced sample explanation cannot be marketed until at least one item passes the editorial and rights gates.
6. A human screen-reader smoke test still requires a verification record. The keyboard, 200 percent equivalent reflow, and maskable-icon safe-zone checks are complete.
7. Full Stripe payment lifecycle testing, matching live resources, staged enforcement, rollback rehearsal, and 48-hour monitoring remain tracked in the billing launch documents.
8. Production must be promoted from the reviewed `25d717a` candidate and smoke-tested so the public page no longer serves the stale pre-migration approved-count claim.

## Release and rollback procedure

1. Keep both application and database billing enforcement off until every paid-launch blocker is closed.
2. Migration `0019` is applied. `npm run content:inventory` reports `schema_complete: true`, and the database portion of `npm run security:verify` passed after the migration.
3. Push and deploy the reviewed published-count verifier delta, then require the full `npm run security:verify` command to pass against Production before recording the release as aligned.
4. Run the complete local browser suite and the canonical Production public, demo, metadata, header, capture, and authorization smoke checks.
5. If a regression appears, keep `billing_required=false`, promote baseline deployment `dpl_Gq1hajW4xPKNM81xFakZh7nXAnRu`, and repair forward. With billing off, migration `0019` preserves current private-beta question access.
6. Re-run the smoke suite after any promotion or rollback.
