# Montreal QBank billing launch decisions

Status: **Not approved for live billing**

Billing enforcement must remain disabled until every owner decision and launch gate below is complete. Do not place secret keys in this file or in source control.

Last verified billing Preview: `https://lmcc-prep-7pyy1fp9p-fuannes-projects.vercel.app` (built and route-smoke-tested 2026-08-25; protected by Vercel authentication). The reconciliation hardening is deployed in Preview and migration `0010_billing_reconciliation.sql` is applied to the linked database with enforcement off.

Latest readiness preflight: 16 of 27 checks passed on 2026-08-25. The linked database is reachable with enforcement off and a three-day grace period. Stripe variables, public prices, support configuration, approved terms, and the local canonical site URL are absent. The `claim_stripe_webhook_event` RPC is available. Vercel has a Production canonical site URL but no Stripe variables.

## Owner decisions

| Decision | Current value |
| --- | --- |
| Stripe product and customer-facing product name | Approved: `Montreal QBank` |
| Monthly price in CAD | Pending owner approval |
| Annual price in CAD | Pending owner approval |
| Free trial | Pending owner approval |
| Tax inclusion and Stripe Tax | Pending owner approval |
| Refund policy | Pending owner approval |
| Cancellation policy | Recommended: cancel at period end, pending owner approval |
| Failed-payment grace period | Implemented default: 3 days, pending owner approval |
| Existing-user complimentary access | Pending owner approval |
| Public onboarding path | Current implementation: invite-only access request |
| Support email | Pending owner approval |
| Legal business name | Pending owner approval |
| Statement descriptor | Pending owner approval |
| Business address | Pending owner approval |

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
