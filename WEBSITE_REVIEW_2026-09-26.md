# Website review, September 26, 2026

**Resolved and deployed September 26.** All five findings below are fixed in production deployment `dpl_qyaCYEKbDb67YTmsMeLUuGWZdSwo` at https://montrealqbank.vercel.app. The original findings remain below as the review record.

The release adds dependency-aware conflict handling, a visible sync warning, and a recovery dialog that restores the online session while preserving pending session changes in a downloadable browser backup. Independent notes and flags continue uploading. Transient read failures now return 503 without clearing valid offline access; initialization has usable retry controls. Successful profile/preference saves update the account-scoped browser cache, including protection against stale in-flight refreshes. Demo library links create a separate one-question session for the requested question ID. Service-worker version v4 delivers the corrected offline interface.

Final release validation: build and TypeScript passed; full lint and 253 release unit tests passed; 36 general browser tests passed with two live-account tests intentionally skipped; an additional authenticated local-fixture preference test passed. Conflict dialog accessibility and layout passed at 320px, 390px and 1440px. Live read-only checks passed at 390px and 1440px, including question 1026, v4 offline shell and anonymous API restrictions, with no page errors or attempted writes. All 339 deployed source files match the tested isolated release. No database migrations or production learner-data writes were needed.

Reviewed production `https://montrealqbank.vercel.app`, deployment `dpl_3dQKf4VuwHUJ6gnBnFHMLUdVGRqb`, plus its previously verified release at `/private/tmp/montrealqbank-parity-release.J9IFxP`. The source files cited below match that release. No application changes or production learner writes were made during this review.

## Findings

### 1. High: a permanent sync conflict blocks all subsequent uploads

Location: `lib/study-store.ts:205-213`, with conflicting-answer rejection in `lib/study-server.ts` and the sign-out guard in `components/settings-view.tsx:88`.

If the same session question was answered differently on another device, the server rejects the queued answer. The sync loop always retries `outbox[0]` and stops at that rejection. Later answers, notes and flags cannot upload. There is no conflict-resolution or per-operation recovery control in Offline study settings, and sign-out refuses to proceed while the queue is nonempty. The store's suggestion to discard pending uploads in those settings refers to a control that does not exist.

Local browser reproduction: returned the actual conflicting-answer error from a fixture sync endpoint, then saved a separate note. The queue contained `attempt, note`; the endpoint received `attempt, attempt`, and never received the note. The question player displayed no sync-error warning.

Recommended fix: show persistent sync status in the practice flow, offer a deliberate resolution for rejected operations, and allow independent operations to sync without violating session dependencies. Preserve pending work during recovery.

### 2. Medium: temporary backend errors disable an otherwise valid offline bank

Locations: `app/api/study/snapshot/route.ts:4` and `lib/study-store.ts:136`.

The snapshot endpoint converts every exception, including ordinary data-query failures, to HTTP 403. The client treats every 403 as an account/access change, clears the active cache marker and active snapshot, and disables the saved workspace even when its offline authorization has not expired. The underlying records remain, but offline startup can no longer discover them.

Local browser reproduction: started with a valid saved bank, then returned the endpoint's 403 response during Refresh my progress. The active marker changed from `demo-user:mccqe` to null, the record remained in IndexedDB, and the interface required signing in again.

Recommended fix: distinguish confirmed authentication/entitlement failures from temporary backend failures. Keep an unexpired offline workspace usable after transient failures.

### 3. Medium: a failed initial download has no usable retry control

Locations: `components/offline-study-settings.tsx:39` and `lib/study-store.ts:98`.

Both Download offline study and Refresh my progress require an existing snapshot. When the first download fails, neither button can retry it. Opening Settings through navigation does not retry initialization because the store already considers the account ready. Session creation remains disabled until a full reload or a connectivity event succeeds.

Local browser reproduction: injected a temporary 500 on the initial snapshot request, then navigated to Settings. Exactly one snapshot request occurred, and both recovery buttons were disabled.

Recommended fix: allow initialization/retry for a signed-in account without a snapshot and show a clear retry action wherever study initialization fails.

### 4. Medium: saved study preferences do not update the player cache

Locations: `components/settings-view.tsx:59-63`, `components/study-provider.tsx:8-27`, and `components/study-session.tsx:36`.

Save preferences updates the server profile but neither updates nor refreshes `studyStore`. The player now reads shortcuts and explanation auto-scroll from `snapshot.profile`. The provider only reopens when the user or exam changes, so ordinary navigation can continue using the old preferences until a manual refresh or document reload. Profile-name changes have the same cache-invalidation gap.

Evidence: source trace confirms the missing update. A local demo check showed a successful save message, the changed switch, unchanged cached preferences, and zero new snapshot requests. Because demo profile writes are intentionally no-ops, the real-account persistence path was assessed from source rather than tested with production account writes.

Recommended fix: update the cached profile after a successful save, then refresh authoritative data as appropriate. Include a real-account fixture regression test that saves preferences and navigates directly to practice.

### 5. Medium: demo question-library links open the wrong question

Locations: `components/question-player.tsx:30-32` and `app/api/practice/[qid]/route.ts:10-13`.

The demo library redirects a selected question to `/session/demo?q=N`, but the player only honors `q` in review mode. For unfinished sessions, it uses the saved cursor instead. Thus selecting another question opens the current question, commonly question 1001.

Local browser reproduction: requesting question 1006 produced the expected redirect `/session/demo?q=6`, but that destination displayed `Question ID 1001`.

Recommended fix: honor an explicit question selection in the demo, or create a dedicated one-question local session using the requested question ID. Cover the actual destination question in the library test, not just its link URL.

## Verification and limits

- Current workspace: all 250 unit tests passed; full lint passed.
- Local production release: 32 browser tests passed, two live Supabase tests intentionally skipped. Coverage includes public links, metadata, accessibility, mobile layouts, ordinary practice, offline reload, download account isolation and lost-response retry.
- Live production: read-only desktop 1440px and phone 390px checks passed for practice controls, study plan, statistics and offline settings. No JavaScript page errors or practice-page horizontal overflow. Anonymous snapshot/download endpoints rejected access. All non-GET/HEAD browser requests were blocked.
- The new failure scenarios used isolated browser contexts, local demo data and intercepted API responses. No real purchases, password-reset emails, account mutations or learner-data writes were performed.
- Passing existing tests does not cover these findings. This was a website behavior and source review, not another clinical question-bank content audit.
