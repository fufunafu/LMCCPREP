# Montreal QBank billing implementation status

Last audited: 2026-08-25

Billing is implemented locally, disabled by default, and not approved for live payment collection. This file records implementation evidence and separates completed engineering work from owner-controlled launch work.

## Phase status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 0. Reproducible database | Implemented | GitHub `main` contains the complete ordered `supabase/migrations` history. README setup commands use tracked paths. Vercel reports Root Directory `.` for the repository rooted at `web/`. Local Supabase runtime metadata, environment files, source exports, and credentials are ignored. |
| 1. Stripe account and catalog | Commercial terms approved; Stripe setup required | Monthly CA$59 and annual CA$349 pricing, no trial, cancellation, refund, grace, beta access, onboarding, and statement descriptor decisions are approved. No Stripe variables currently exist in Vercel. The test product, prices, portal, and webhook endpoint still need to be configured. |
| 2. Billing data model | Implemented and applied | Billing migrations `0009_billing.sql` and `0010_billing_reconciliation.sql` are applied remotely with enforcement off. Migration `0011_deduplicate_questions.sql` is unrelated and remains pending; later migration `0012_question_tags.sql` is applied. |
| 3. Server Stripe foundation | Implemented | Stripe, server-only Stripe and Supabase clients, configuration validation, trusted plan mapping, entitlement helpers, key-mode checks, approved-price enforcement during webhook synchronization, and disabled-by-default flags are present. |
| 4. Checkout, portal, and webhook | Implemented locally | Authenticated same-origin Checkout and portal handlers, trusted prices and identities, raw signature verification, atomic event claiming, idempotency, event ordering, failed-payment grace, paid-invoice recovery, cancellation access, and Stripe reconciliation are covered by unit tests. Live Stripe CLI delivery tests require owner test credentials and catalog setup. |
| 5. Entitlement enforcement | Implemented | Private layouts, paid data loaders, route handlers, and paid server actions enforce entitlement. Database RLS remains the final layer. Billing and Settings remain reachable for recovery, and demo mode bypasses live billing services. |
| 6. Billing interface | Implemented; legal identity pending | Marketing pricing, Billing, Settings, portal recovery, bounded post-Checkout polling, mobile layout, accessibility, renewal and cancellation timing, approved refund terms, tax disclosure, legal links, support, and non-affiliation copy are present. Legal business name, address, and support email remain required before live billing. |
| 7. Testing | Local gates pass | Lint, TypeScript, 56 unit tests, production build, 17 standard browser tests, and 5 billing browser tests pass. Two real-Supabase browser checks are intentionally opt-in. Stripe CLI, card decline, renewal failure, and payment-flow production smoke tests require configured external services. |
| 8. Safe rollout | Not started for billing activation | Billing enforcement is off in both the application and database. Test and live Stripe configuration, complimentary grants, staged activation, live smoke tests, rollback verification, and 48-hour monitoring remain owner-controlled launch work. |

## Current external evidence

- Billing readiness: 19 of 27 preflight checks pass with the current local environment.
- Database `billing_required` is false and `grace_days` is 3.
- Remote migrations `0001` through `0010` and `0012` are applied. Unrelated migration `0011` is not applied.
- All four remote billing tables are currently empty.
- Vercel contains Supabase variables, the Production canonical site URL, approved public prices, and disabled billing safety flags, but no Stripe secrets or price IDs.
- Stripe CLI is not installed in the current development environment.
- Latest billing Preview: `https://lmcc-prep-7pyy1fp9p-fuannes-projects.vercel.app`, built and route-smoke-tested successfully with billing disabled.
- Latest Vercel Production and billing Preview deployments are Ready with billing disabled.
- The canonical Production public and demo smoke suite passed on 2026-08-25: 17 tests passed and the 2 real-Supabase mutation checks remained intentionally opt-in.
- The application, billing plan, and readiness preflight consistently use the customer-facing name `Montreal QBank`. Infrastructure identifiers remain unchanged.
- GitHub `main` contains the complete billing implementation and tracked migration history.

## Safe next sequence

1. Obtain the legal business name, business address, and support email listed in `BILLING_LAUNCH_DECISIONS.md`.
2. Configure Stripe test mode and Vercel Preview variables without sharing values in chat or source control.
3. Run Stripe Checkout, portal, signed webhook, decline, retry, cancellation, duplicate, and reconciliation tests in Preview.
4. Add approved complimentary grants.
5. Configure matching live resources and deploy with database enforcement still off.
6. Deploy application enforcement first, verify health, then enable database enforcement.
7. Run production smoke and rollback tests, then monitor the first 48 hours.
