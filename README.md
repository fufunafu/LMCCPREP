# LMCC Prep

LMCC Prep is a private, mobile-first question bank for Canadian medical learners preparing for the MCCQE Part I. It supports tutor and timed sessions, progress analytics, flags, notes, password recovery, profile settings, dark mode, and an installable PWA experience.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and provide the public Supabase project values.
3. From the repository root, apply the Supabase migrations with `supabase db push`.
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

1. Apply every migration in `../supabase/migrations`.
2. In Supabase Authentication URL settings, set the production Site URL.
3. Add `https://lmcc-prep.vercel.app/auth/callback` as an allowed redirect URL. Add the matching localhost callback while testing locally.
4. Confirm that email invitations and password-recovery messages point to `/auth/callback`.
5. Keep Row Level Security enabled. The checked-in policies restrict profiles, sessions, attempts, flags, and notes to the authenticated owner. Public access is limited to inserting an access request.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The browser suite covers the live public subject aggregate, one-click demo authentication, protected routes, sign-out, password recovery, dashboard navigation, tutor and timed sessions, refresh restoration, notes, flags, review links, reset confirmation, offline fallback, light and dark accessibility, 375px layouts, and an iPhone viewport. Real login failure and password-reset submission checks are opt-in because they contact the configured Supabase project:

```bash
RUN_SUPABASE_E2E=1 npm run test:e2e
```

## Deployment

The project is linked to Vercel. Configure the required environment variables for Production and Preview, deploy with `vercel --prod`, then run the browser suite against the deployment:

```bash
PLAYWRIGHT_BASE_URL=https://lmcc-prep.vercel.app npx playwright test
```

Private app routes send both metadata and an `X-Robots-Tag` header that prevent indexing. The public landing page remains indexable.
