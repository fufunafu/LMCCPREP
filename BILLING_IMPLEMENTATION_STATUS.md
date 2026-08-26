# Montreal QBank billing implementation status

Last audited: 2026-08-26

Billing is implemented locally, disabled by default, and not approved for live payment collection. This file records implementation evidence and separates completed engineering work from owner-controlled launch work.

## Phase status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 0. Reproducible database | Implemented | GitHub `main` contains the complete ordered `supabase/migrations` history. README setup commands use tracked paths. Vercel reports Root Directory `.` for the repository rooted at `web/`. Local Supabase runtime metadata, environment files, source exports, and credentials are ignored. |
| 1. Stripe account and catalog | Test catalog and credential configured | Test product `Montreal QBank` is active with one CA$59 monthly price and one CA$349 annual price, both recurring CAD prices with no trial. A least-privilege restricted test key is stored in Vercel Preview and Development, and the test customer portal is active. |
| 2. Billing data model | Implemented and applied | Billing migrations `0009_billing.sql` and `0010_billing_reconciliation.sql` are applied remotely with enforcement off. Migration `0011_deduplicate_questions.sql` is unrelated and remains pending; later migration `0012_question_tags.sql` is applied. |
| 3. Server Stripe foundation | Implemented | Stripe, server-only Stripe and Supabase clients, configuration validation, trusted plan mapping, entitlement helpers, key-mode checks, approved-price enforcement during webhook synchronization, and disabled-by-default flags are present. |
| 4. Checkout, portal, and webhook | Test endpoint configured | Authenticated Checkout and portal handlers, raw signature verification, atomic event claiming, idempotency, event ordering, failed-payment grace, paid-invoice recovery, cancellation access, and Stripe reconciliation are covered by unit tests. The protected Preview test endpoint listens to all six required events. Its signing secret is captured securely but still needs explicit approval for upload to Vercel. |
| 5. Entitlement enforcement | Implemented | Private layouts, paid data loaders, route handlers, and paid server actions enforce entitlement. Database RLS remains the final layer. Billing and Settings remain reachable for recovery, and demo mode bypasses live billing services. |
| 6. Billing interface | Implemented and published | Marketing pricing, Billing, Settings, portal recovery, bounded post-Checkout polling, mobile layout, accessibility, renewal and cancellation timing, approved refund terms, tax disclosure, legal links, operator identity, business address, public support email, and non-affiliation copy are present and verified on Production. |
| 7. Testing | Local gates and test preflight pass | Lint, fresh-clone TypeScript, 56 unit tests, production build, 17 standard browser tests, 5 billing browser tests, and the dedicated full-stack rollback test pass. The secure Preview preflight passes 36 of 36 checks. Signed delivery and end-to-end Stripe payment scenarios remain pending the signing-secret upload and redeploy. |
| 8. Safe rollout | Test rollout in progress | Billing enforcement is off in both the application and database. The local full-stack rollback path is verified. The protected test Preview and webhook destination exist. Signed delivery, payment scenarios, complimentary grants, live resources, staged activation, live smoke, rollback execution, and 48-hour monitoring remain. |

## Current external evidence

- Billing readiness: the secure Preview preflight passes 36 of 36 checks when run locally with the captured test credentials. The deployed Preview still lacks `STRIPE_WEBHOOK_SECRET`, so signed delivery is not yet operational there.
- Database `billing_required` is false and `grace_days` is 3.
- Remote migrations `0001` through `0010` and `0012` are applied. Unrelated migration `0011` is not applied.
- All four remote billing tables are currently empty.
- Vercel contains Supabase variables, the Production canonical site URL, approved public prices and support email, completed legal terms, disabled billing safety flags, both test price IDs, and the restricted Stripe test key in Preview and Development. The webhook signing secret is not yet uploaded.
- Stripe CLI is not installed in the current development environment.
- Latest billing Preview: `https://lmcc-prep-8fq2d61ar-fuannes-projects.vercel.app`, deployment `dpl_4tRdjCMQ9mMf6gzLYq6QoELGJvzg`, built from clean commit `bcdf330f4c17164ad0d08ea4c02744bb06105708`, Ready with billing disabled.
- Latest Vercel Production deployment: `https://lmcc-prep-baoyz9p2i-fuannes-projects.vercel.app`, deployment `dpl_CJRQT67qL3L51CFegrfxoUdTZjaS`, built from clean GitHub commit `6c55ae4f6ea59b52e15b8585aab7a6b19fae7bc5` and aliased to `https://lmcc-prep.vercel.app`. It is Ready with billing disabled.
- The canonical Production public and demo smoke suite passed after that deployment on 2026-08-25: 17 tests passed and the 2 real-Supabase mutation checks remained intentionally opt-in. The suite verified the published operator identity, business address, public support email, prices, refund threshold, demo billing isolation, accessibility, PWA behavior, and private-route controls.
- The dedicated rollback browser suite passed on 2026-08-25. It verifies that the documented database-first and application-second rollback state restores dashboard access and paid session creation for an invited user without a subscription.
- Stripe test product `prod_V8yyvR88zyshaR` has verified recurring CAD prices of CA$59 monthly and CA$349 annually, distinct lookup keys, and no trial. The active test customer portal enables invoice history, payment-method updates, and cancellation at the end of the billing period.
- A least-privilege restricted Stripe test key can read the approved catalog, portal, and webhook configuration and can perform only the application operations required for customers, Checkout, portal sessions, subscriptions, and readiness inspection.
- The Vercel automation bypass is active. The protected Preview returns HTTP 401 without it and reaches the application webhook route with it, where an unsigned request correctly returns HTTP 400.
- Stripe test destination `we_1U8mBJCT7OeO0NwLCOQ7XGQk` is active against the protected Preview and listens to `checkout.session.completed`, the three customer subscription events, `invoice.paid`, and `invoice.payment_failed`. Its signing secret is captured in a protected temporary file but is not yet in Vercel.
- The owner approved `15041074 Canada Inc.` and its Etobicoke business address for public legal disclosure, and privately supplied the Canadian GST/HST and Quebec QST registrations for later Stripe validation. Registration numbers are not stored in source control.
- The owner approved `fuanne_gm@hotmail.com` as the public support email.
- The application, billing plan, and readiness preflight consistently use the customer-facing name `Montreal QBank`. Infrastructure identifiers remain unchanged.
- GitHub `main` contains the complete billing implementation and tracked migration history.

## Safe next sequence

1. Obtain explicit approval to upload the captured webhook signing secret to Vercel Preview and Development, then redeploy the exact verified source state.
2. Verify direct signed webhook delivery through the bypass URL.
3. Run Stripe Checkout, portal, signed webhook, decline, retry, cancellation, duplicate, and reconciliation tests in Preview.
4. Add approved complimentary grants.
5. Configure matching live resources and deploy with database enforcement still off.
6. Deploy application enforcement first, verify health, then enable database enforcement.
7. Run production smoke and rollback tests, then monitor the first 48 hours.
