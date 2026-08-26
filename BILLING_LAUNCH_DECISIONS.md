# Montreal QBank billing launch decisions

Status: **Not approved for live billing**

Billing enforcement must remain disabled until every owner decision and launch gate below is complete. Do not place secret keys in this file or in source control.

Last verified billing Preview: `https://lmcc-prep-7pyy1fp9p-fuannes-projects.vercel.app` (built and route-smoke-tested 2026-08-25; protected by Vercel authentication). The reconciliation hardening is deployed in Preview and migration `0010_billing_reconciliation.sql` is applied to the linked database with enforcement off. The Stripe test catalog was created and verified on 2026-08-26.

Latest readiness preflight: 24 of 27 checks passed on 2026-08-26. The linked database is reachable with enforcement off and a three-day grace period. Approved public prices, the legal business identity, business address, support email, completed legal terms, local canonical site URL, and both test price IDs are configured. The three expected failures are the intentionally absent test API key, key-mode validation, and webhook signing secret. The `claim_stripe_webhook_event` RPC is available. Vercel Preview and Development contain the non-secret test price IDs, while Stripe secrets remain absent.

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
- [ ] Test webhook endpoint is configured for all required events.
- [ ] Preview contains only test-mode Stripe values.
- [ ] Checkout success, decline, cancellation, renewal failure, duplicate event, and portal tests pass.
- [ ] Complimentary grants are added for approved users.
- [ ] Matching live product, prices, portal, and webhook are configured.
- [x] Production legal, support, tax, and business information is published and verified on the canonical site. Deployed and smoke-tested 2026-08-25.
- [ ] An approved live transaction and refund test passes, if required.
- [ ] Application enforcement is deployed first, then database enforcement is enabled and both are verified together.
- [ ] Production smoke tests pass and rollback is verified.
