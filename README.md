# Montreal QBank

Montreal QBank is a private, mobile-first question bank for Canadian medical learners preparing for the MCCQE. It supports tutor and timed sessions, progress analytics, flags, notes, password recovery, profile settings, dark mode, and an installable PWA experience.

## LMCC question-bank audit status

The full LMCC question review is complete for the authoritative 4,972-question snapshot. The verified output contains 4,036 nonduplicate survivors after 1,397 corrections and 936 confirmed duplicate removals. Do not repeat the general LMCC question review unless the source snapshot changes, the strict verifier fails, or a new review is explicitly requested.

See [`audit-output/LMCC_QUESTION_BANK_AUDIT_COMPLETE.md`](audit-output/LMCC_QUESTION_BANK_AUDIT_COMPLETE.md) for the durable completion record, final checksums, artifacts, and rerun conditions.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and provide the public Supabase project values.
3. For a local Supabase stack, run `supabase start` and `supabase db reset`. To use an existing hosted project, run `supabase link --project-ref <project-ref>` and then `supabase db push`.
4. Start the app with `npm run dev`.

The **Use demo login** button opens the demo in one click. The equivalent credentials are `demo@lmccprep.ca` and `practice` for direct form testing. Demo requests use mock data and never call or write to Supabase. Practice answers, flags, notes, and the current demo question are saved only in that browser so a refresh can restore the session. Signing out or resetting progress clears that browser-only state.

## Required environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
```

Set `NEXT_PUBLIC_SITE_URL` to the canonical origin without a trailing slash, for example `https://lmcc-prep.vercel.app`. The app uses it for password-recovery redirects and other trusted absolute URLs.

The optional qbank capture helper also requires these server-only variables:

```text
CAPTURE_TOKEN
CAPTURE_OWNER_EMAIL
SUPABASE_SERVICE_ROLE_KEY
```

Do not expose the service-role key through a `NEXT_PUBLIC_` variable. Leave all three capture variables unset in production when the private capture endpoint is not needed.

## Supabase configuration

Before real accounts are used:

1. Apply every tracked migration in `supabase/migrations` with `supabase db push`.
2. In Supabase Authentication URL settings, set the production Site URL.
3. Add `https://lmcc-prep.vercel.app/auth/callback` as an allowed redirect URL. Add the matching localhost callback while testing locally.
4. Confirm that email invitations and password-recovery messages point to `/auth/callback`.
5. Keep Row Level Security enabled. The checked-in policies restrict profiles, sessions, attempts, flags, and notes to the authenticated owner. Public access is limited to inserting an access request.

The repository contains the complete ordered schema history, including the billing tables, entitlement function, Stripe event ledger, billing-aware content policies, and reconciliation hardening. Seed exports, source PDFs, local databases, and credentials must remain outside this repository.

Question and clinical-image rights, provenance, editorial review, and the paid-distribution gate are governed by [`CONTENT_GOVERNANCE.md`](CONTENT_GOVERNANCE.md). Run `npm run content:inventory` to create the ignored local inventory used by that review process.

After migration `0020_atomic_content_approval_workflow.sql` is applied, approved review decisions are applied only through private manifests and the service-only atomic approval workflow. Start with `scripts/content-approvals.example.json`, run `npm run content:approvals -- --file /private/path/content-approval-batch.json` for a dry run, and use the explicit apply confirmation documented in `CONTENT_GOVERNANCE.md` only after release-owner review. Never commit a completed approval manifest or its protected evidence references.

## Stripe billing setup

Billing is fail-safe and disabled by default. Before enabling it, create one Montreal QBank product with monthly and annual recurring CAD prices in Stripe, configure the customer portal, approve the legal and commercial terms, and set these server-only variables:

Review the requirement-by-requirement state in [`BILLING_IMPLEMENTATION_STATUS.md`](BILLING_IMPLEMENTATION_STATUS.md), and record and approve the outstanding commercial decisions in [`BILLING_LAUNCH_DECISIONS.md`](BILLING_LAUNCH_DECISIONS.md) before adding live configuration.

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY
STRIPE_PRICE_ANNUAL
SUPABASE_SERVICE_ROLE_KEY
BILLING_GRACE_DAYS
BILLING_TERMS_READY
```

Optional billing settings are `STRIPE_TRIAL_DAYS`, `STRIPE_AUTOMATIC_TAX`, `NEXT_PUBLIC_BILLING_MONTHLY_CAD`, `NEXT_PUBLIC_BILLING_ANNUAL_CAD`, and `NEXT_PUBLIC_SUPPORT_EMAIL`. The public price values are display-only. Stripe Checkout remains authoritative for the amount charged.

Create a Stripe webhook endpoint at `/api/stripe/webhook` and subscribe it to:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Use test keys and test prices in local and Preview environments. Use live keys and matching live prices only in Production. Keep `BILLING_REQUIRED=false`, `BILLING_TERMS_READY=false`, and `billing_settings.billing_required=false` until Checkout, portal, webhook, entitlement, cancellation, failure, and duplicate-delivery tests have passed.

After test-mode variables and owner decisions are configured, run `npm run billing:verify`. The preflight validates key mode without printing keys, confirms the monthly and annual CAD catalog, proves displayed prices match Stripe, checks that both prices share the Montreal QBank product, validates the canonical site and support configuration, inspects portal cancellation behavior and the exact webhook URL and events, verifies Stripe Tax configuration when enabled, verifies the linked billing tables and functions, and confirms both enforcement switches remain off. Use `npm run billing:verify -- --allow-incomplete` while setup is still in progress.

Prepare complimentary access from a private manifest based on `scripts/billing-grants.example.json`. Keep the real manifest outside the repository. The command is a dry run unless the explicit apply confirmation is present, rejects billing-test accounts, and never shortens an existing grant:

```bash
npm run billing:grants -- --prepare /private/path/billing-grants.json
npm run billing:grants -- --file /private/path/billing-grants.json --activation 2026-09-01T04:00:00Z
npm run billing:grants -- --file /private/path/billing-grants.json --activation 2026-09-01T04:00:00Z --apply --confirm APPLY_BILLING_GRANTS
```

Preparation classifies `CAPTURE_OWNER_EMAIL` as an administrator, excludes billing-test accounts, and classifies other current accounts as existing invited users. Review the private file and change any reviewer classifications before the dry run. Use `existing_user` for 90 days, `reviewer` for 180 days, and `administrator` for non-expiring access. The activation timestamp is mandatory for temporary grants so their periods begin at the approved paywall activation time rather than the day the manifest is prepared.

Enabling or rolling back the paywall requires changing both enforcement switches in a safe order. For activation, first deploy `BILLING_REQUIRED=true` while the database switch is still false. Existing invite access remains available during that deployment. After the deployment and billing routes are healthy, enable the database switch:

```sql
update billing_settings
set billing_required = true, grace_days = 3, updated_at = now()
where id = true;
```

Verify immediately that an entitled account enters the app and an unsubscribed account is redirected to Billing. For rollback, first set `billing_settings.billing_required=false` so database access reopens immediately, then set `BILLING_REQUIRED=false` and redeploy. Keep the webhook endpoint running throughout activation and rollback so subscription state continues to synchronize.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:billing-e2e
npm run test:billing-rollback
npm run build
npm run test:e2e
```

The dedicated billing browser suite uses local Supabase-compatible fixtures and does not contact Stripe or the linked Supabase project. It covers unsubscribed and expired redirects, active and canceled access, real session creation, Checkout plan submission, portal recovery, safe billing errors, mobile layout, and accessibility. The rollback suite separately proves that disabling both documented enforcement switches restores dashboard and session access for an invited user without a subscription. The main browser suite covers the live public subject aggregate, one-click demo authentication, protected routes, sign-out, password recovery, dashboard navigation, billing isolation in demo mode, tutor and timed sessions, refresh restoration, notes, flags, review links, reset confirmation, offline fallback, light and dark accessibility, 375px layouts, and an iPhone viewport. Real login failure and password-reset submission checks are opt-in because they contact the configured Supabase project:

```bash
RUN_SUPABASE_E2E=1 npm run test:e2e
```

## Deployment

The project is linked to Vercel. Configure the required environment variables for Production and Preview, deploy with `vercel --prod`, then run the browser suite against the deployment:

```bash
PLAYWRIGHT_BASE_URL=https://lmcc-prep.vercel.app npx playwright test
```

Private app routes send both metadata and an `X-Robots-Tag` header that prevent indexing. The public landing page remains indexable.
