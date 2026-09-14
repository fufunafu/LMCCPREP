# Exam access and study planning

Each subscription grants access to one exam. The server maps verified Stripe price IDs to MCCQE or USMLE, and the database restricts content and private images to that exam. Learner-editable metadata does not determine paid access. The dashboard and Settings display the assigned bank without an exam switcher.

The first dashboard visit asks for an exact date, an approximate date, or an explicit unknown answer. Unknown is saved separately from unanswered. The plan divides remaining questions in the assigned bank across the available days, reserving roughly the final 20% for review when at least a week remains. Learners can update their date from the dashboard or Settings.

## Deployment

1. Apply `0029_exam_date_planning.sql` and `0030_subscription_exam_access.sql` before deploying the application changes. Existing target dates become exact dates. Existing subscriptions are classified as MCCQE because the existing Stripe price configuration represents MCCQE plans. Review any manually provisioned exceptions before applying this classification.
2. Keep the existing `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_QUARTERLY`, and `STRIPE_PRICE_ANNUAL` values for MCCQE. Configure distinct USMLE prices with `STRIPE_PRICE_USMLE_MONTHLY`, `STRIPE_PRICE_USMLE_QUARTERLY`, and/or `STRIPE_PRICE_USMLE_ANNUAL`, plus the corresponding public CAD amounts in `.env.example`. A price ID reused across plans fails closed.
3. Each price must be CAD and recurring. Monthly and quarterly plans use a month interval with counts of 1 and 3; annual plans use a year interval with count 1. If using Payment Links, configure separate USMLE links containing their matching prices. Keep each Checkout subscription to one price item. Do not create a bundled exam price.
4. Deploy the application with the existing verified-webhook integration. The webhook writes the exam assignment and subscription state atomically, respecting existing event ordering and payment grace periods. No Stripe products, prices, or live subscriptions are created by this change.

Complimentary and private-access learners retain their administrator-assigned profile exam. Subscription synchronization also aligns `profiles.exam_id` for native clients. The native UI may still offer its older exam selector, but the database rejects learner changes to the assigned exam.

## Validation

Run `npm run typecheck`, the billing and study-plan unit tests, and `npm run test:migration:exam-access`. The migration test uses a disposable local PostgreSQL cluster and never connects to production. If local PostgreSQL is unavailable, set `EXAM_TEST_PGLITE_MODULE` to an installed PGlite module path to execute the same checks in in-memory PostgreSQL.

Database checks cover both exam banks, direct API reads of questions and images, stale subscription events, profile-edit protection, date persistence, grace periods, expired access, and complimentary grants. Browser checks use demo data; demo date edits are previews and do not persist to a real account.
