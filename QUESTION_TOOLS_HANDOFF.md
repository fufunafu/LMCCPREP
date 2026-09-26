# Question highlighting and visible notes

September 26, 2026

Select text in a question stem or explanation and choose **Highlight**. Select an existing highlight and choose **Remove**. Green highlights appear directly on the text in light and dark mode, without an instruction row, saved-highlight counter or panel. Highlighting excludes answer buttons so selecting text cannot submit an answer.

Highlights are stored in this browser for the current account, exam and question. They survive question navigation, reloads and offline practice. They do not sync to other devices. The existing clear-download and sign-out flows clear their local study storage. Highlighting requires the CSS Custom Highlight API. Quote and context anchors reattach highlights after compatible text changes, while ambiguous or removed passages do not mark unrelated text.

The notes field appears beneath the desktop question navigator and below the question on phones. Edits save automatically through the existing local note storage and sync queue. The field and Question tools drawer share the same draft, including previously saved notes. Each question keeps its own note. Notes have a 5,000-character limit.

The question header keeps **Previous** and a green **Next** button available before and after answering. Next changes the current position without replacing the question or recording an answer. Unanswered questions remain available when navigating back. **Skip question** replaces an unanswered question; it is hidden after answering. The final question offers **See results**.

Implementation: `components/question-highlighter.tsx`, `lib/text-highlights.ts`, the optional `StudySnapshot.highlights` field, and small integrations in `question-content.tsx` and `question-player.tsx`. No database migration or new dependency.

Validation covers cross-element Markdown selections, Unicode offsets, overlapping and ambiguous highlights, account/exam isolation, navigation, offline persistence, removal, mobile touch controls, existing practice flows, and accessibility.
