# Montreal QBank billing launch decisions

Status: **Not approved for live billing**

Billing enforcement must remain disabled until every owner decision and launch gate below is complete. Do not place secret keys in this file or in source control.

Last verified billing Preview: `https://lmcc-prep-7pyy1fp9p-fuannes-projects.vercel.app` (built and route-smoke-tested 2026-08-25; protected by Vercel authentication). The reconciliation hardening is deployed in Preview and migration `0010_billing_reconciliation.sql` is applied to the linked database with enforcement off.

Latest readiness preflight: 19 of 27 checks passed on 2026-08-25. The linked database is reachable with enforcement off and a three-day grace period. Approved public prices and the local canonical site URL are configured. Stripe variables, support configuration, and final legal identity approval remain absent. The `claim_stripe_webhook_event` RPC is available. Vercel has the Production canonical site URL plus approved non-secret price and safety values, but no Stripe secrets or price IDs.

## Owner decisions

| Decision | Current value |
| --- | --- |
| Stripe product and customer-facing product name | Approved: `Montreal QBank` |
| Monthly price in CAD | Approved: CA$59 per month |
| Annual price in CAD | Approved: CA$349 per year; CA$29.08 monthly equivalent and about 51% below twelve monthly payments |
| Free trial | Approved: no Stripe trial at launch; retain the free no-card demo |
| Tax inclusion and Stripe Tax | Approved: prices exclude applicable tax; enable Stripe Tax only after required registrations are confirmed |
| Refund policy | Approved: request within 7 calendar days of the initial purchase with no more than 25 answered questions; renewal refunds within 7 days only with no post-renewal use; mandatory consumer rights still apply |
| Cancellation policy | Approved: cancel at period end with access retained through the paid period; no routine prorated refunds |
| Failed-payment grace period | Approved: 3 calendar days |
| Existing-user complimentary access | Approved: existing invited users receive 90 days from activation, reviewers receive 180 days, and administrators receive explicit non-expiring grants |
| Public onboarding path | Approved: remain invite-only for at least 60 days and until at least 50 paying customers, then review self-service onboarding |
| Support email | Pending owner approval |
| Legal business name | Pending owner approval |
| Statement descriptor | Approved: `MONTREAL QBANK` |
| Business address | Pending owner approval |

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

- [ ] Owner decisions above are approved and reflected in the legal pages.
- [x] Billing migration `0009_billing.sql` is applied and verified with enforcement off. Applied 2026-08-25; `billing_required=false`, `grace_days=3`.
- [x] Reconciliation hardening migration `0010_billing_reconciliation.sql` is applied and verified with enforcement off.
- [ ] Stripe test product and monthly and annual CAD prices exist.
- [ ] Stripe test customer portal is configured.
- [ ] Test webhook endpoint is configured for all required events.
- [ ] Preview contains only test-mode Stripe values.
- [ ] Checkout success, decline, cancellation, renewal failure, duplicate event, and portal tests pass.
- [ ] Complimentary grants are added for approved users.
- [ ] Matching live product, prices, portal, and webhook are configured.
- [ ] Production legal, support, tax, and business information is published.
- [ ] An approved live transaction and refund test passes, if required.
- [ ] Application enforcement is deployed first, then database enforcement is enabled and both are verified together.
- [ ] Production smoke tests pass and rollback is verified.
