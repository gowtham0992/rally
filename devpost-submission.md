# Rally

**Working submission copy — October 3, 2026.** The project description and
tool list were saved to `rally-m2lakh`. Devpost unexpectedly published the
project page when it was saved; it is now hidden from the owner’s portfolio,
but the direct project URL remains accessible. The hackathon entry is still
incomplete and unsubmitted, with no video. The form answers below remain local.
This packet is not ready for final approval until the open gates below pass.
See [the saved-state record](evidence/devpost-project-save.json).

## One-line summary

Six friends, one studio booking, everyone pays their own share.

## Project description

### Inspiration

Planning a group experience asks one person to do several jobs: find a time,
understand everyone's requirements, negotiate with the studio, and sometimes
pay for everyone before collecting their shares. A spending limit can be
private. A casual message can hide the detail that decides whether a plan works.

Rally focuses on friends booking a private pottery session. Its promise is to
find a plan that fits their confirmed requirements, then let each person pay
their own share. That promise is the product hypothesis; we have not yet
validated demand with real groups or studios.

### What it does

Each friend saves their available studio dates, private spending limit and
essential requirements. The group sees who is ready, without seeing individual
budgets or private notes. An optional AI clarification helps resolve wording
that could change which session fits.

The demo's consequential example is a friend who says, “I leave Friday.” They
might be unable to attend, or they might only be unable to collect their pottery
after firing. Rally asks rather than guessing. The participant confirms the
meaning. If another friend will collect, the owner nominates that friend and
both separately agree to the arrangement and its disclosure.

Confirmed facts go to a deterministic planner. It checks published prices,
dates, capacity, capabilities and collection rules against every participant's
requirements. It can return no suitable option. It cannot invent a cheaper
workshop, relax a private limit or volunteer a collector. In the prepared
example, a $50 private limit rules out the $72 wheel workshop while a $48
hand-building session can still fit.

The studio reviews an exact proposal and explicitly reserves its session,
including time for setup and cleanup. One approval opens a two-hour payment
window and permits settlement when everyone qualifies. Each friend reviews the
same frozen offer and approves their own share through PayPal sandbox.

The payment engine confirms a booking only after verifying every required
capture. If settlement fails, it refunds completed captures and voids remaining
authorizations. An uncertain provider response remains unresolved while Rally
checks the original operation; it does not become a success message or a fresh
logical charge.

These are implemented prototype behaviors. The full six-friend hosted browser
journey is still being verified; the current actual financial proof uses three
distinct sandbox buyers through the local service and CLI.

### How we built it

Rally uses Next.js and TypeScript for its mobile web app, Supabase managed Auth
for verified identities, and PostgreSQL for private preferences, immutable
offers, reservations and durable payment operations. The database rejects
overlapping reservations for the studio resource.

PayPal Orders v2 creates separate `AUTHORIZE` orders. Payments v2 captures,
voids and refunds them; resource GETs verify provider outcomes and ownership.
The webhook receiver authenticates original request bytes and treats a valid
notification as a reason to reconcile an existing operation, rather than proof
that a booking may confirm.

Astropods supplies server-side model inference using `claude-sonnet-4-6` in the
recorded evaluation. The model sees the participant's saved note and published
studio facts, without private budgets or other friends' details. Its structured
output must cite exact source text. Participants confirm proposed meanings;
the model has no booking or payment authority. The structured alternative uses
the same controls, catalog and planner.

One Render Free web service hosts the app at a custom domain. Existing Supabase
Cron invokes bounded payment processing only while work needs attention. The
hosted transport has passed idle verification; active recovery after a cold
wake remains a release gate.

Codex helped refine the scope, implement the app and payment lifecycle, inspect
the UI, and run verification. The recorded tests deliberately weaken safeguards
to check that the suite catches failures. Human PayPal approvals remain human
actions, and generated demo identities are labeled fictional.

### What we verified

Three distinct PayPal sandbox buyers completed a $144 booking, with three
verified $48 captures. In a separate fault run, we deliberately canceled one
authorization after the first capture: the booking aborted, the $48 capture was
refunded, and the remaining authorizations were voided. A third run deliberately
dropped a successful capture response and recovered after a worker restart
without an additional capture. Saved provider GETs independently checked these
results.

The final AI evaluation passed 72 of 72 assessments across 24 authored
synthetic cases repeated three times, with zero safety failures. It compares
against an independently authored structured baseline and a separate
constraint oracle. Earlier failed runs remain available. This is model and
planning evidence, not measured user benefit.

The latest local suite passed 123 tests and caught 22 deliberate mutations.
Hosted checks have verified HTTPS, private identity scope, judge-role sessions,
the scheduler's idle transport and rejection of a forged webhook signature.
Genuine signed PayPal webhook delivery and the complete hosted six-buyer flow
are still pending.

### What comes next

Finish the six-friend browser booking and active hosted recovery recording,
then test whether real groups understand the clarification, collection
agreement and individual payment flow. Seek a studio's feedback on the
two-hour reservation commitment before making real availability claims. The
current studio catalog and prepared friends are fictional, and all payments
are sandbox payments.

## Official form answers

Field IDs and labels were checked against the live official form on October 3.
The exact field metadata is saved in
[the requirements snapshot](evidence/submission-requirements-2026-10-03.json).
No entry below authorizes accepting terms or sending the final submission.

| Field ID | Answer to review or finish |
| --- | --- |
| 28778 — Submitter Type | **User answer required:** Individual, Team or Organization. |
| 28779 — Country of Residence | **User answer required.** Do not infer residence from timezone or account details. |
| 28780 — Canadian province | **User answer required:** province if applicable; otherwise N/A. |
| 28781 — Organization name | **User answer required:** name if applicable; otherwise N/A. |
| 28782 — New or Existing | **User confirmation required.** The first repository commit is October 1 at 19:48:14 Denver time; that alone does not establish when all prior work began. |
| 28783 — Earlier work and event-period changes | **Finish after 28782.** If new, N/A. If existing, disclose actual prior work and distinguish work built after the event opened. Do not infer the answer from Git alone. |
| 28784 — Main technology requirement | Use the technology answer below after confirming it matches the release shown in the video. |
| 28786 — Additional sponsors | **Astropods; Render.** No other sponsor integration is claimed. |
| 28788 — Public GitHub repository | `https://github.com/gowtham0992/rally` — **currently private; publish and verify before using as a public judging link.** Root MIT license and setup instructions exist. |
| 28787 — Working demo | `https://rally.gowthamsarveswaran.com` — deployed sandbox preview; full journey verification still pending. |
| 28798 — Testing instructions or credentials | Use the judge instructions below after a fresh browser rehearsal. Add the judge code only to the intended private submission field, never this repository. |
| 28790 — PayPal integration rating | **User answer required:** choose your own 1–10 rating. |
| 28791 — Rating explanation | Draft technical feedback appears below; personalize it to your rating and experience. |
| 28792 — Permission to contact for feedback | **User answer required:** Yes or No. |
| 28793 — APIMatic Context Plugin experience | Leave blank: no use of this plugin is claimed. |
| 28799 — AG Grid experience | Leave blank: no use of AG Grid is claimed. |
| 28794 — Age attestation | **User attestation required; unchecked.** |
| 28795 — Eligible jurisdiction attestation | **User attestation required; unchecked.** |
| 28796 — Employment/representation attestation | **User attestation required; unchecked.** |

### 28784: Main technology requirement

PayPal is the checkout and settlement layer. Rally creates one PayPal Orders v2
AUTHORIZE order per participant, then uses Payments v2 to capture verified
authorizations, void unused ones and refund completed captures when a group
booking cannot finish. Server-side GET verification checks the exact offer,
buyer, amount, currency and seller before financial state changes. All provider
operations use PayPal sandbox; no real money is moved.

Astropods hosts the model used for bounded, optional clarification of a
participant's saved wording. It proposes an evidenced interpretation or useful
question; the participant confirms the meaning. A deterministic planner then
checks confirmed requirements against the published studio catalog. AI cannot
change prices, reveal budgets, supply consent or authorize payments. Recorded
actual-model evaluation uses claude-sonnet-4-6 and an equivalent structured
baseline.

Render Free hosts the working Next.js app. Supabase provides managed Auth,
PostgreSQL and the private scheduled transport for bounded payment processing.

### 28791: Technical feedback draft

Separate authorization, capture, void and refund resources made it possible to
model a group booking without one participant financing everybody. The harder
part was recovery: a missing response can mean that a payment completed, so the
app must retain operation identity and reconcile provider resources before
trying again. We built separate ownership, amount and state checks rather than
treating a browser return or webhook notification as confirmation. A worked
group-settlement example covering partial capture, refund and uncertain
responses would be useful documentation for this use case.

## Judge instructions — draft, rehearse before release

Open `https://rally.gowthamsarveswaran.com/demo` and enter the judge code supplied
in the private testing field. Render Free may take about a minute to wake.
Keep this browser profile: a new profile claims another finite workspace.
Five separate workspaces exist; four are currently unclaimed. Workspaces are
not reset or recycled. New sessions are configured to end December 16 at
00:00 UTC. A freshly claimed hosted session's exact expiry still needs to be
observed during the release rehearsal.

Your group contains six fictional friends and a fictional studio. Four friends
have prepared details. Use the demo's role switcher to try Alex, Sam, Jordan and
the separate studio operator; role changes affect the current demo browser.
Refresh or resume an older tab after switching rather than saving as the former
friend. Judge cookies are separate from your personal Rally sign-in.

Enter Alex's available studio date, $50 limit and requirement to form a cup.
For Sam, use the same date, a $55 limit and the note “I leave Friday.” Follow the optional
clarification and confirm what Sam means; choosing collection by Jordan does
not create Jordan's agreement. Review and close the exact six-friend roster as
Alex, then separately complete Sam's disclosure and Jordan's collection
agreement. The valid hand-building option costs $48 per person; a $72 wheel
session does not fit Alex's confirmed limit.

As the studio, review the exact proposal and the reservation commitments before
opening the two-hour booking window. As each friend, review the frozen offer
and approve only that friend's sandbox payment. Use six distinct Personal
PayPal sandbox buyers. **The six-buyer account assignment and complete browser
instructions are not ready yet; do not release this paragraph as a verified
checkout guide.** PayPal passwords must never appear in public source or
screenshots.

For reviewed evidence now, use the saved three-buyer
[PayPal sandbox report](evidence/paypal-sandbox/index.html) and
[AI evaluation report](public/evidence/ai/index.html). These are separate
engineering runs, not a recording of this judge workspace or real customer
validation. Do not use a real PayPal account or payment instrument.

## Demo video and gallery

Public YouTube URL: **missing**. The current
[155-second recording plan](docs/demo-plan.md) is a script, not a recorded video.
The official form requires a public YouTube video under three minutes showing
the app functioning. Record the completed journey; retain clear fictional
studio and PayPal sandbox labels. Prepared earlier actions must be labeled.

Capture these real product views after the browser rehearsal:

1. A narrow phone view of the six-friend plan beside the signed-in friend's
   private details. Frame the roster so another friend's budget is absent.
2. Sam's actual relevant clarification and confirmed answer, followed by
   Jordan's separate agreement. Capture no private credentials.
3. The $48 candidate and the studio's exact reservation approval.
4. The completed six-buyer sandbox booking with verified payment status.
5. A separately labeled recovery run showing the actual refunded/voided
   outcome. Do not caption the existing three-buyer recovery as six-buyer proof.

The current screenshots in `evidence/web/` document narrower verified paths;
select and recapture the final gallery against the release, rather than
presenting them as the complete finished journey.

## Release checklist

- [ ] Complete the hosted six-friend planning, consent and studio approval path.
- [ ] Verify six distinct sandbox buyer approvals and the confirmed booking.
- [ ] Observe genuine signed PayPal webhook delivery, deduplication and recovery.
- [ ] Verify active hosted processing after cold wake and uncertain responses.
- [ ] Observe a freshly claimed hosted judge session's fixed expiry and rehearse
      the testing instructions without leaking credentials or consuming all groups.
- [ ] Audit the full source/history and publish the repository with its MIT
      license and reproducible setup; verify access while signed out.
- [ ] Record, edit and publish the actual demo to YouTube; verify duration below
      180 seconds and public playback while signed out.
- [ ] Obtain user answers for personal fields and the required attestations.
- [ ] Seek real user and studio feedback with permission before any contact;
      label the absence of feedback if it remains unavailable.
- [ ] Recheck the official requirements and reconcile every claim to the final
      build, video and evidence before requesting final submission approval.

Submission deadline: November 12, 2026 at noon Pacific (`20:00 UTC`). Judging is
December 1–15. These dates were read from the official connector on October 3.
No final entry submission, real-money transaction or paid service charge is
authorized by this draft.
