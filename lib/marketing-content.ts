export const marketingFaqs = [
  ["Who is Montreal QBank for?", "It is designed for Canadian medical students and graduates preparing for the MCCQE, formerly MCCQE Part I."],
  ["How do I get access?", "Try the no-card demo immediately or request an invitation for saved account access. The current rollout does not offer purchases."],
  ["What is included?", "The current practice scope is Pediatrics, Psychiatry, Internal Medicine, Population Health and Community Medicine, and Surgery. Obstetrics and Gynecology is not included. Invited accounts see only the content available to their account."],
  ["How does timed mode match the exam?", "Timed mode uses 83 seconds per question, matching the current MCCQE pace of 115 questions in 160 minutes."],
  ["Can I use it on my phone?", "Yes. Every practice surface is designed to work comfortably on phone-sized screens and larger."],
] as const;

export type FaqGroup = { title: string; items: ReadonlyArray<readonly [string, string]> };

/** Longer, topic-grouped FAQ shown only on the dedicated /faq page. */
export const extendedFaqGroups: readonly FaqGroup[] = [
  { title: "Getting started", items: marketingFaqs },
  {
    title: "The demo",
    items: [
      ["What does the free demo include?", "The demo opens a complete practice environment with a dashboard, tutor and timed sessions, flags, notes, session review, and statistics so you can see how everything works before requesting access."],
      ["Do I need a card or an account for the demo?", "No. The demo needs no card and no account. It runs on temporary, simulated data and is clearly labelled as such throughout."],
      ["Is my demo progress saved?", "No. Demo data is temporary and is not linked to an account. Saved progress requires an invited account."],
      ["Can I request access while in the demo?", "Sign out of the demo first. Access requests are only accepted from the public site so that demo sessions stay isolated from real accounts."],
    ],
  },
  {
    title: "Practice sessions",
    items: [
      ["What is the difference between tutor and timed mode?", "Tutor mode reveals the answer and explanation immediately after each question. Timed mode holds explanations until the end and paces you at 83 seconds per question, with an optional 115-question section that mirrors a full exam block."],
      ["Can I pause a session and come back later?", "Yes. Active sessions keep your position, so you can return to where you left off from the dashboard."],
      ["What are flags and notes?", "Flag any question you want to revisit and keep your own notes beside it. Both are available while answering and again during session review."],
      ["What happens after I submit an answer?", "You see the correct answer, an explanation, and the item's references, reviewer role, and review date so you can judge the source for yourself."],
      ["Can I see all the questions I have attempted?", "Yes. Session review shows every question in a completed session, and the Questions page lets you browse and filter your history."],
    ],
  },
  {
    title: "Content and quality",
    items: [
      ["Where do the questions come from?", "Every item carries rights and editorial metadata. Public counts and paid access include only questions that are rights-approved and editorially reviewed to a Canadian standard; anything else is withheld."],
      ["Why do the subject counts show zero or change over time?", "Counts reflect only content that has completed rights and editorial review. They grow as the review process publishes approved items."],
      ["How do you handle duplicate or incorrect questions?", "The bank is de-duplicated and corrected in reviewed batches before release. If you spot a problem, use the report option on the question and it is routed to editorial review."],
      ["Is Montreal QBank affiliated with the Medical Council of Canada?", "No. Montreal QBank is an independent study resource and is not affiliated with, endorsed by, or connected to the Medical Council of Canada."],
      ["Is this a substitute for clinical advice?", "No. Montreal QBank is an educational service only and must not be used for urgent clinical questions or patient care decisions."],
    ],
  },
  {
    title: "Progress and analytics",
    items: [
      ["What does the dashboard track?", "Accuracy, questions attempted, average response time, daily and weekly activity, a study streak, and your weakest topics, so you always have a concrete next step."],
      ["Can I reset my progress?", "Yes. Reset progress is available from Settings and requires explicit confirmation because it cannot be undone."],
    ],
  },
  {
    title: "Accounts and privacy",
    items: [
      ["How do I sign in or recover my password?", "Invited accounts sign in with email and password. Password recovery is available from the sign-in page and never confirms whether an address has an account."],
      ["How do I delete my account or my data?", "Contact support to request access, correction, or deletion of your data. Identity verification may be required before a request is completed. See the Privacy page for details."],
      ["Does the site work offline?", "Montreal QBank can be installed as a web app. If your connection drops, an offline page is shown; practice itself requires a connection."],
    ],
  },
  {
    title: "Billing",
    items: [
      ["How much does it cost?", "Invited learners can choose monthly, three-month, or annual access in Canadian dollars. Current prices are listed on the Pricing page; taxes and the final total are shown before payment."],
      ["How do I cancel?", "Cancel any time from the Stripe customer portal in your account's Billing page. Renewal stops and access continues through the paid period."],
      ["Who processes payments?", "Billing is processed by Stripe. Montreal QBank never sees or stores your full card details."],
      ["What is your refund policy?", "Refund terms are published on the Refund policy page and are linked from every pricing surface."],
    ],
  },
];
