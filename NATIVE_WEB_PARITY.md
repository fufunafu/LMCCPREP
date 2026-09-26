# Native study features on the web

Implemented September 25, 2026.

- Answers save durably in IndexedDB before tutor feedback or timed advancement. Repeated delivery uses a stable operation ID; the server computes correctness and enforces account, exam and session membership.
- Skip replaces an unanswered question within its filters, preserves session length, excludes earlier skips and resets its timer and annotations. It creates no attempt. Reviewed question groups use the same content fingerprints as iOS.
- Crossed-out choices and the current position survive reloads. The three-dot question menu includes notes, flags, reports and browser read aloud. Review offers missed-question retries and related topics.
- Plans use daily minutes, minutes per question and a future exam date. Blocks contain at most 20 questions, with due reviews before new questions. Seven- and thirty-day statistics separate first attempts from repeated practice using the full downloaded history.
- Settings provides Download offline study and Refresh my progress. The offline workspace supports practice, review, question browsing, notes, plans and statistics. Access expires at the earlier of the server authorization deadline and its 72-hour limit.
- The service worker caches the public offline shell and static assets, never private server-rendered pages, RSC responses or API responses. Downloaded figures use the active account and exam's cache and authorization expiry.
- Bank, history and notes downloads are paginated. The existing saved bank is replaced only after a complete download. Pending work is retained for its original account when authentication changes. Signing out requires queued work to sync first.

Plans, crossed-out choices and browser speech settings are local to the browser. Answers, flags, notes, reports and session changes sync to the existing backend. Database session filters use the native snake_case format, including skipped question IDs. No schema migration is required.

Validation: production build, TypeScript and full ESLint passed. The isolated release passed 247 unit tests and 32 browser tests, with two opt-in live-authentication tests skipped. Browser coverage includes offline reload, timer reset after replacement, figures, access expiry, paginated download, account changes, lost-response replay, accessibility and mobile layouts. Visual checks passed at 1440, 390 and 320 pixels in light and dark themes.

Browser tests use synthetic demo data and a mocked sync service for connection-loss and account-change cases; they do not modify learner accounts.
