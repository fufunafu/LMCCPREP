# Montreal QBank billing implementation status

Last audited: 2026-08-26

Billing is implemented locally, disabled by default, and not approved for live payment collection. This file records implementation evidence and separates completed engineering work from owner-controlled launch work.

## Phase status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 0. Reproducible database | Implemented | GitHub `main` contains the complete ordered `supabase/migrations` history. README setup commands use tracked paths. Vercel reports Root Directory `.` for the repository rooted at `web/`. Local Supabase runtime metadata, environment files, source exports, and credentials are ignored. |
| 1. Stripe account and catalog | Test catalog configured; scoped branding in progress | Test product `Montreal QBank` is active with one CA$59 monthly price and one CA$349 annual price, both recurring CAD prices with no trial. A least-privilege restricted test key is stored in Vercel Preview and Development, and the test customer portal is active. The owner approved using the shared `RF-Transparent-Zoho` Stripe account. Montreal QBank will use a per-Checkout display-name override and its product-specific subscription statement descriptor so the account-wide glass-railing identity remains unchanged. |
| 2. Billing data model | Implemented and applied | Billing migrations `0009_billing.sql` and `0010_billing_reconciliation.sql` are applied remotely with enforcement off. Migration `0011_deduplicate_questions.sql` is unrelated and remains pending; later migration `0012_question_tags.sql` is applied. |
| 3. Server Stripe foundation | Implemented | Stripe, server-only Stripe and Supabase clients, configuration validation, trusted plan mapping, entitlement helpers, key-mode checks, approved-price enforcement during webhook synchronization, and disabled-by-default flags are present. |
| 4. Checkout, portal, and webhook | Signed delivery and pre-payment routes verified | Authenticated Checkout and portal handlers, raw signature verification, atomic event claiming, idempotency, event ordering, failed-payment grace, paid-invoice recovery, cancellation access, and Stripe reconciliation are covered by unit tests. The protected Preview test endpoint listens to all six required events, has its signing secret configured, and accepts a signed event exactly once across duplicate delivery. An authenticated Preview test user receives HTTP 400 for an unknown plan and Stripe-hosted URLs for the approved monthly Checkout and customer portal. Checkout cancellation returns safely without creating a subscription. |
| 5. Entitlement enforcement | Implemented | Private layouts, paid data loaders, route handlers, and paid server actions enforce entitlement. Database RLS remains the final layer. Billing and Settings remain reachable for recovery, and demo mode bypasses live billing services. |
| 6. Billing interface | Implemented and published | Marketing pricing, Billing, Settings, portal recovery, bounded post-Checkout polling, mobile layout, accessibility, renewal and cancellation timing, approved refund terms, tax disclosure, legal links, operator identity, business address, public support email, and non-affiliation copy are present and verified on Production. |
| 7. Testing | Local gates and signed-delivery controls pass | Lint, TypeScript, 81 unit tests, production build, 17 standard browser tests, 5 billing browser tests, and the dedicated full-stack rollback test pass. Direct signed delivery and duplicate-event idempotency passed against the prior protected destination. The expanded readiness audit now passes 35 of 37 checks and identifies the two pending Stripe saves. End-to-end Stripe payment lifecycle scenarios remain. |
| 8. Safe rollout | Test rollout in progress | Billing enforcement is off in both the application and database. The local full-stack rollback path is verified. A clean billing-only Preview contains the scoped Checkout branding and enforcement hardening. A private complimentary-grant manifest is prepared and dry-run, but no grant has been applied. Payment scenarios, Stripe configuration saves, grants at activation, live resources, staged activation, live smoke, rollback execution, and 48-hour monitoring remain. |

## Current external evidence

- Billing readiness: the expanded secure Preview preflight passes 35 of 37 checks. The only failures are the unsaved product statement descriptor and the active Stripe destination still targeting the prior protected Preview.
- Database `billing_required` is false and `grace_days` is 3.
- Remote migrations `0001` through `0010` and `0012` are applied. Unrelated migration `0011` is not applied.
- The authenticated route smoke created one dedicated test billing customer. The subscription and access-grant tables remain empty. The webhook ledger contains two processed signed smoke events with no processing errors.
- Vercel contains Supabase variables, the Production canonical site URL, approved public prices and support email, completed legal terms, disabled billing safety flags, both test price IDs, the restricted Stripe test key, and the webhook signing secret in Preview and Development.
- Stripe CLI is not installed in the current development environment.
- Latest billing Preview: `https://lmcc-prep-494ye63zl-fuannes-projects.vercel.app`, deployment `dpl_5WAWeYbwooCLxY2VCnkZuH4BnLkJ`, built from a verified billing-only snapshot. It is Ready with billing disabled.
- Latest Vercel Production deployment: `https://lmcc-prep-baoyz9p2i-fuannes-projects.vercel.app`, deployment `dpl_CJRQT67qL3L51CFegrfxoUdTZjaS`, built from clean GitHub commit `6c55ae4f6ea59b52e15b8585aab7a6b19fae7bc5` and aliased to `https://lmcc-prep.vercel.app`. It is Ready with billing disabled.
- The canonical Production public and demo smoke suite passed after that deployment on 2026-08-25: 17 tests passed and the 2 real-Supabase mutation checks remained intentionally opt-in. The suite verified the published operator identity, business address, public support email, prices, refund threshold, demo billing isolation, accessibility, PWA behavior, and private-route controls.
- The dedicated rollback browser suite passed on 2026-08-25. It verifies that the documented database-first and application-second rollback state restores dashboard access and paid session creation for an invited user without a subscription.
- Stripe test product `prod_V8yyvR88zyshaR` has verified recurring CAD prices of CA$59 monthly and CA$349 annually, distinct lookup keys, and no trial. The active test customer portal enables invoice history, payment-method updates, and cancellation at the end of the billing period.
- A least-privilege restricted Stripe test key can read the approved catalog, portal, and webhook configuration and can perform only the application operations required for customers, Checkout, portal sessions, subscriptions, and readiness inspection.
- The Vercel automation bypass is active. The protected Preview returns HTTP 401 without it and reaches the application webhook route with it, where an unsigned request correctly returns HTTP 400.
- Stripe test destination `we_1U8mBJCT7OeO0NwLCOQ7XGQk` is active against the protected Preview and listens to `checkout.session.completed`, the three customer subscription events, `invoice.paid`, and `invoice.payment_failed`. The signing secret is stored in Vercel Preview and Development.
- Direct signed delivery passed on 2026-08-26. Event `evt_mqbank_signed_smoke_1787773666376` returned HTTP 200 on first delivery and HTTP 200 with `duplicate: true` on the duplicate, while producing one processed ledger record and no billing state.
- Authenticated Preview route checks passed on 2026-08-26. An untrusted plan returned HTTP 400, the approved monthly plan returned a `checkout.stripe.com` URL, Manage billing returned a `billing.stripe.com` URL, and canceling Checkout returned to Billing with no charge or subscription.
- Supabase has three confirmed auth users: one dedicated billing-test account, one owner, and one other invited account. The permission-restricted grant manifest excludes the test account, classifies the owner as administrator and the other account as an existing invited user, and dry-runs as one non-expiring grant plus one 90-day grant. No billing grant row has been written.
- The first Checkout check displayed the shared account identity `Glass Railing - RF Transparent`; the signed-in Stripe Dashboard identifies the account as `RF-Transparent-Zoho` and shows account descriptor `GLASS-FENCE.COM`. On 2026-08-26, the owner explicitly approved using this shared account. The implementation now applies a per-Checkout `Montreal QBank` display name, and the Montreal QBank product will use its own `MONTREAL QBANK` subscription statement descriptor without changing account-wide details.
- The owner approved `15041074 Canada Inc.` and its Etobicoke business address for public legal disclosure, and privately supplied the Canadian GST/HST and Quebec QST registrations for later Stripe validation. Registration numbers are not stored in source control.
- The owner approved `fuanne_gm@hotmail.com` as the public support email.
- The application, billing plan, and readiness preflight consistently use the customer-facing name `Montreal QBank`. Infrastructure identifiers remain unchanged.
- GitHub `main` contains the complete billing implementation and tracked migration history.

## Safe next sequence

1. Save the prepared `MONTREAL QBANK` test product descriptor and point the prepared Stripe test destination at the latest protected Preview.
2. Repeat signed delivery, the readiness preflight, the authenticated route smoke, and Checkout branding verification.
3. Run successful payment, decline, retry, cancellation, renewal-failure, duplicate, and reconciliation tests in Preview.
4. Confirm the private role classifications and apply approved complimentary grants at the paywall activation timestamp.
5. Configure matching live resources and deploy with database enforcement still off.
6. Deploy application enforcement first, verify health, then enable database enforcement.
7. Run production smoke and rollback tests, then monitor the first 48 hours.
