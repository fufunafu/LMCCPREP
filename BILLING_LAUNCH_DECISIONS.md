# Montreal QBank billing launch decisions

Status: **Live resources staged; payment collection remains disabled**

Billing enforcement must remain disabled until every owner decision and launch gate below is complete. Do not place secret keys in this file or in source control.

Latest billing-only Preview: `https://lmcc-prep-p4sysjcrj-fuannes-projects.vercel.app` (deployment `dpl_3SsAfxrXUSgvDZL932v8fxXKrw5h`). It is protected by Vercel authentication and billing remains disabled.

Latest expanded secure Preview preflight: 37 of 37 checks passed on 2026-08-26 using the protected test credentials and the exact protected Preview origin. The restricted test key and webhook signing secret are stored in Vercel Preview and Development. Direct signed delivery and duplicate-event idempotency passed against the updated destination.

Authenticated pre-payment checks and the complete test lifecycle pass. The Preview rejects unknown plans, creates approved Stripe-hosted Checkout sessions, opens the customer portal, and returns safely from cancellation. Checkout displays `Montreal QBank` as the product heading and subscription title. A dedicated test user completed an insufficient-funds decline, successful retry, signed webhook provisioning, portal inspection, failed renewal, exact three-day grace, paid recovery, period-end cancellation, and access cutoff. Duplicate and stale events were handled safely, and authoritative reconciliation passed.

The matching live product, monthly and annual prices, tax behavior, product tax code, customer portal, and six-event webhook endpoint are staged. Live price IDs are stored in Vercel Production. The live restricted key and rotated webhook signing secret remain blocked behind Stripe owner identity verification. GST/HST and Quebec QST registrations still require private owner entry. Both enforcement switches remain off, no live Checkout Session can be created, and no live payment exists.

Production now exposes 115 rights-approved questions. On 2026-08-27, the authorization verifier confirmed that every published discipline count matches the approved production aggregate and that the content and billing isolation controls remain enforced.

## Owner decisions

| Decision | Current value |
| --- | --- |
| Stripe product and customer-facing product name | Approved: `Montreal QBank` |
| Monthly price in CAD | Approved: CA$59 per month |
| Annual price in CAD | Approved: CA$349 per year; CA$29.08 monthly equivalent and about 51% below twelve monthly payments |
| Free trial | Approved: no Stripe trial at launch; retain the free no-card demo |
| Tax inclusion and Stripe Tax | Approved: prices exclude applicable tax; Canadian GST/HST and Quebec QST registrations were supplied privately and must be validated in Stripe before enabling automatic tax. Registration numbers must not be committed. |
| Refund policy | Approved: request within 7 calendar days of the initial purchase with no more than 25 answered questions; renewal refunds within 7 days only with no post-renewal use; mandatory consumer rights still apply |
| Cancellation policy | Approved: cancel at period end with access retained through the paid period; no routine prorated refunds |
| Failed-payment grace period | Approved: 3 calendar days |
| Existing-user complimentary access | Approved: existing invited users receive 90 days from activation, reviewers receive 180 days, and administrators receive explicit non-expiring grants |
| Public onboarding path | Approved: remain invite-only for at least 60 days and until at least 50 paying customers, then review self-service onboarding |
| Support email | Approved: `fuanne_gm@hotmail.com` |
| Legal business name | Approved: `15041074 Canada Inc.` |
| Statement descriptor | Approved: `MONTREAL QBANK` |
| Business address | Approved: `67 Westmore Dr, Unit 19, Etobicoke, ON M9V 3Y6, Canada` |

Pricing will be reviewed after 90 days or 50 paid customers. Existing subscribers should keep their launch price for at least 12 months. Annual subscribers should receive an upcoming-renewal reminder 30 days before renewal.

## Implemented technical decisions

- One approved product with monthly and annual recurring CAD prices.
- Stripe-hosted Checkout and customer portal.
- Active and trialing subscriptions are entitled.
- Past-due access uses a bounded grace period.
- Cancellation retains access only through the paid period.
- Explicit access grants can bypass subscriptions.
- Demo mode does not call Stripe or Supabase billing services.
- Browser input cannot select Stripe price IDs, user IDs, or return URLs.
- Preview and Development accept only Stripe test keys. Production accepts only Stripe live keys.
- `BILLING_REQUIRED`, `BILLING_TERMS_READY`, and database enforcement default to false.

## Activation gates

- [x] Owner decisions above are approved and reflected in the legal pages.
- [x] Billing migration `0009_billing.sql` is applied and verified with enforcement off. Applied 2026-08-25; `billing_required=false`, `grace_days=3`.
- [x] Reconciliation hardening migration `0010_billing_reconciliation.sql` is applied and verified with enforcement off.
- [x] Stripe test product and monthly and annual CAD prices exist. Verified 2026-08-26: CA$59 monthly, CA$349 annually, recurring CAD, no trial.
- [x] Stripe test customer portal is configured for invoice history, payment-method updates, and cancellation at the end of the billing period. Verified 2026-08-26.
- [x] Test webhook endpoint is configured for all required events. Verified 2026-08-26 against the protected Preview.
- [x] Preview contains only test-mode Stripe values, the webhook signing secret, and a Vercel automation bypass secret. The known-good Preview was redeployed and direct signed delivery was verified on 2026-08-26.
- [x] Checkout displays Montreal QBank through the session-specific override, and the product uses the approved `MONTREAL QBANK` subscription statement descriptor without changing shared account details. Verified 2026-08-26.
- [x] Checkout success, decline, cancellation, renewal failure, duplicate event, reconciliation, access cutoff, and portal tests pass.
- [ ] Complimentary grants are added for approved users.
- [ ] Matching live product, prices, portal, and webhook are fully configured. Catalog and endpoint are staged; the live key, rotated signing secret, and tax registrations remain.
- [x] Production legal, support, tax, and business information is published and verified on the canonical site. Deployed and smoke-tested 2026-08-25.
- [ ] An approved live transaction and refund test passes, if required.
- [ ] Application enforcement is deployed first, then database enforcement is enabled and both are verified together.
- [ ] Production smoke tests pass and rollback is verified.
- [x] The production approved-content aggregate is nonzero and matches the paid catalog promise. Verified at 115 published questions on 2026-08-27.
