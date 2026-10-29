# Does Rally feel like an app? — October 28, 2026

Review and proposal only. Nothing was implemented, deployed, sent or claimed. No credentials, environment files or private evidence were read.

**What this is based on**

| Source | What it covers |
| --- | --- |
| Source at `6ab7eb8` | The live application commit is `0073eab` |
| The release's own screenshots | `evidence/web/usability-*-2026-10-27.png`, produced by the local controlled component check |
| Live public pages, read at 375×812 today | `/join?invite=example` (no valid invite), `/login`, home |

I did not sign in, use a judge workspace, or run the authenticated flow.

**How claims are labelled**

| Label | Meaning |
| --- | --- |
| **Observed** | Seen on a live page or a recorded screenshot |
| **Code fact** | Read in source |
| **Hypothesis** | Any statement about how people will react. No real friend group or studio has used Rally. |

## The candid answer

Rally is now a **better-explained process, not yet a well-designed app.**

The October 27 fixes are real and mostly correctly implemented. They were added the way the previous fixes were: as another conditional section on one long page.

The plan page is a single 39 KB component (`app/groups/[id]/view.tsx`). It can render about twenty independent sections, each with its own small grey label and heading. Which ones appear depends on state. Nothing on the page decides what matters *now* for *this* person. The result reads like a ledger of conditions.

The owner's instinct is right, and the cause is structural rather than verbal:

1. **The headline describes state, not action.** Jordan, who has a pickup request to answer, is greeted with "Your details are in." The request appears below a fit summary. *Observed:* `usability-pickup-desktop-2026-10-27.png`.
2. **The biggest element on a phone is the wrong number.** The left column stacks above the content on a phone. The first screen is "Pottery / Willow Studio / **6/7** Details saved / Copy invite link / Who's coming". Jordan's request is about two screens down. *Observed:* `usability-reminder-mobile-2026-10-27.png`. *Code fact:* layout order in `view.tsx`.
3. **The forward actions are styled as secondary.** "Everyone's in — find a session", "Ask the studio", "I'll pick it up" and "Ask Jordan" all use the outlined `secondary` style. *Code fact:* across the plan, offer, studio and component files there are 13 filled primary buttons, 33 secondary buttons and 29 text links. *Observed:* the disabled "Everyone's in" in `usability-minimum-group-2026-10-27.png`.
4. **The object the user is working on changes shape.** It is "Pottery" on the plan page, "Your booking" on the offer page, a row on Your plans, and a request on the studio page. These have different layouts, headings and progress indicators.
5. **Internal states leak into the interface.** Labels like "Getting everyone in", "Choosing a plan", "Studio review", "planning round", "roster", "published sessions", "payment approvals verified" and "authorization qualifies" (in the reminder text) are workflow states written as copy.
6. **Explanation is standing in for design.**
   - The login page asks people to choose "Open in browser" before requesting a link.
   - The invite page leads with the catalog, prices and dates. Its only action, "Continue to your invitation", sits at **972 px on an 812 px screen**. *Observed live.*
   - The login page itself is the best screen in the product: one heading, one field, one lime button. The rest of the app should feel like that.

The redesign below keeps every protection and almost every component. It changes what is shown first, what is styled as the main action, and what is moved out of the way.

## 1. Previous findings, reassessed

| October 27 finding | Status | Evidence |
| --- | --- | --- |
| Organizer can't see who is blocking | **Resolved in code; effect awaiting humans** | The per-person status and the "Who needs to take a step?" reminder are in `src/intake/service.ts:133` and `view.tsx`. The organizer-only payment list is in `app/offers/[id]/view.tsx`. *Observed:* `usability-payment-reminder-2026-10-27.png`. Residual issues: the payment reminder text says "authorization qualifies", and the plan-stage reminder appears below the fit summary and pickup sections. |
| Sign-in fails when the link crosses browsers | **Unresolved; awaiting the phone rehearsal** | The same-browser code exchange is still in place. A login instruction was added (*observed live*). Custom SMTP fixes delivery to people outside the project team. It does not fix the browser switch. |
| Collector needs extra visits | **Resolved in code; prominence partial** | `PickupRequest` and the early nomination are in place, and the button says "I can't do this". But on Jordan's screen the request sits under "Your details are in." and the fit summary (*observed*). |
| A dropout ends the group | **Resolved before an offer exists** | Roster updates set the group size to the smallest allowed size ≥ the number of people (`src/intake/service.ts:154-165`). *Observed:* the removed-friend notice and the five-person minimum block. |
| Confirmation checkboxes, blocking default, wording | **Mostly resolved** | No preselected pickup choice. Merged action buttons. A neutral, open note. "Collect" still appears in `StudioOptions` ("collected later… ask a friend to agree to collect it", *observed live*), in the catalog's pickup description, and in "after firing" labels. The reminder still says "qualifies". |
| AI clarification pre-empted by the pickup selector | **Awaiting humans** | The note is now neutral and open. The pickup selector still covers the travel case directly. Whether notes arise naturally is unknown. |
| Coordination cost overall | **Partially resolved** | The Sam and Jordan round trip is gone, so a first booking needs about fifteen visits rather than about seventeen. There are still no notifications; reminders are copied by hand. |
| Invite page puts its action below the fold | **New finding** | *Observed live:* the CTA is at 972 px on an 812 px phone screen. |

## 2. Why it still does not feel like an app

**What is the primary object?** To the user it should be *the plan*: "Pottery with Alex's group". It becomes "Thursday 19 Nov · Hand-build" once a session is picked. Today the plan page and the offer page are two different-looking destinations, and the plan's title is the activity category ("Pottery") rather than anything that changes as the plan progresses.

**Can someone identify their next action within five seconds?** On a phone, usually not (*observed*). The first screen is identical for everyone: group name, details-saved counter, invite button, roster. Only the organizer needs most of that.

**Does each state show one clear primary action?** No. Primary styling is used for "Save my details", "Check our options", "Confirm…", and "View the studio's offer". The decisive forward moves are secondary. In several states no filled button appears at all.

**Are completed work, optional details and future steps competing with current work?** Yes. The fit summary, the session preview, saved details, studio terms, the roster editor and earlier-round notices are all peers of the current action. Each has its own heading, so they look equally important.

**Can a returning friend tell what changed?** Only by rereading. The page doesn't have a stable place where "what's new for me" appears. The Your plans list does compute a one-line next step per plan (`nextStep()` in `app/plans/view.tsx`). That is the most app-like logic in the codebase, and the plan page doesn't use it.

**Is the organizer doing administrative work the interface could absorb?**
- **Group size at creation.** The organizer picks 6, 7 or 8 when creating the plan, even though the roster now sets the size.
- **Finding a session.** "Everyone's in — find a session" is a separate step from asking the studio, even when exactly one session fits.
- **Two copy buttons.** The offer page has both "Copy a reminder" and "Copy offer link & deadline".

**Are internal states leaking?** Yes; see item 5 above.

**Is the visual hierarchy supporting the flow?** The type scale, colour and spacing are good, and close to the intended Robinhood clarity. They are applied to the wrong things: the largest number is a progress counter, and the lime accent rarely marks the step that matters. The eyebrow-plus-heading pattern on every section flattens importance.

## 3. One interaction model: one plan, one next step

**Every person sees the same plan, with one thing to do on it.**

Each plan screen has four fixed parts, always in this order:

1. **The plan line.** What, where, when (once known), and a five-stop progress strip:
   *Everyone in → Pick a session → Studio holds it → Everyone approves → Booked*
2. **Your next step.** Exactly one card, chosen for this viewer. It has an action-phrased heading, one sentence, and **the only lime button on the screen**. If there is nothing to do, it is a calm waiting card that says who or what the plan is waiting on. For the organizer, the reminder becomes that card's button.
3. **People.** Avatars with plain status words: *Ready · Has a step · Approved · Not coming*. The organizer's "Edit who's coming" lives here.
4. **Below the fold, collapsed.**
   - *Your details (private)*, with the private session preview inside it.
   - *Terms & timing.*
   - *Earlier offer records*, when they exist.

This is the smallest convincing change because it keeps:
- the routes;
- the services and every privacy projection;
- the consent, payment and capacity semantics;
- nearly every component: `ClarificationPanel`, `PickupRequest`, collection arrangement, `SessionOptions`, `RosterEditor`, `CopyReminder`, `Checkout`, `FitSummary` and `PersonalFit`.

What changes is composition. A single resolver picks which existing component fills the next-step slot. Everything else moves to a fixed place or collapses.

**Informed commitments stay explicit and visible inside the card that asks for them.** Navigation and status become quieter. Disclosures do not:
- The approval card shows the session, price, pickup arrangement and a one-line cancellation summary.
- It keeps the existing consent checkbox and links the full terms.
- The AI data note stays beside "Check this note with AI".
- The sharing note stays beside "Ask Jordan".
- The studio keeps all four attestations.

### Resolver priority

Built from data each viewer already receives; nothing new is exposed.

1. You've been removed from this round → the existing removed-friend card.
2. Your details aren't saved → **Add what works for you** (the form).
3. Someone asked you to pick up → **Sam asked you to pick up their piece** [I'll pick it up] · I can't do this.
4. Your note needs a check → **Check what your note means** (`ClarificationPanel`).
5. You need a pickup friend → **Who could pick up your piece?** (`PickupRequest`).
6. Your choices fit no session → **Your choices don't fit a session yet** [Edit my details] · copy group check-in.
7. *Organizer:* everyone ready, roster open → **Everyone's in** [Find our session].
8. *Organizer:* sessions fit → **Thursday hand-build fits everyone** [Ask Willow Studio to hold it]. If several fit, show a short list with one button each.
9. *Organizer:* people pending → **Waiting on Sam and Jordan** [Copy a reminder].
10. Studio is reviewing → waiting card: **Willow Studio is checking Thursday.** No payment yet.
11. Offer open and your approval needed → **Approve your $48 hold** (the existing `Checkout`, inside the card).
12. Your hold is approved → waiting card: **4 of 6 have approved. Booking confirms when everyone's charge goes through.** The organizer sees names and the reminder button.
13. Booked → **You're booked: Thu 19 Nov, 6:15 PM.** If you are the collector: *You're picking up Sam's piece.*
14. Window ended, withdrawn, declined or recovering → the existing recovery copy, with one action for the organizer.

Steps 1–6 and 11 are the person's own actions and outrank the group's. That is why Jordan's request is at the top of Jordan's page, not under "Your details are in."

### State map

| Stop | Internal states | Next step by role | Route |
| --- | --- | --- | --- |
| 1. Everyone in | `COLLECTING` | Friend: details, note check, pickup ask or answer. Organizer: the same, then **Everyone's in** or the reminder. | `/groups/[id]` |
| 2. Pick a session | `CLOSED` with candidates; no fit; needs answer | Organizer: **Ask the studio to hold it**. Friend: waiting, or own blocker. | `/groups/[id]` |
| 3. Studio holds it | `MERCHANT_REVIEW` | Everyone: waiting. Studio: **Review & hold**. | `/groups/[id]`, `/studio/requests/[id]` |
| 4. Everyone approves | Offer `OPEN`, `SETTLING` | Friend: **Approve your $48 hold**, then waiting. Organizer: plus names and reminder. | `/groups/[id]` card → `/offers/[id]` |
| 5. Booked | `CONFIRMED` | Everyone: booked card. Collector: pickup duty line. | both |
| Off-path | Declined, expired, withdrawn, cancelled, recovery, removed | One explanatory card; organizer gets one action. | both |

### Wireframes (phone, 375 px; everything shown is above the fold)

**Collector, with a request waiting**

```text
┌ rally                      Your plans ┐
│ Pottery with Alex's group             │
│ Willow Studio · Thu or Fri, Nov 19–20 │
│ ●──○──○──○──○  Everyone in            │
│                                       │
│ Sam asked you to pick up their piece  │
│ Willow Studio fires pieces after the  │
│ visit and says when they're ready.    │
│ Saying yes shares this with the       │
│ studio if you book.                   │
│ [ I'll pick it up                 → ] │  lime, the only one
│   I can't do this                     │
│                                       │
│ People  A✓ T✓ S• J• R✓ C✓             │
└───────────────────────────────────────┘
```

**Organizer, when a session fits**

```text
┌ Pottery with Alex's group             │
│ ●──●──○──○──○  Pick a session         │
│                                       │
│ Thursday hand-build fits everyone     │
│ Thu 19 Nov · 6:15–7:45 PM             │
│ $48 per person                        │
│ Nobody pays until the studio holds    │
│ it and everyone approves.             │
│ [ Ask Willow Studio to hold it    → ] │
│                                       │
│ People  6 ready · Edit                │
└───────────────────────────────────────┘
```

**Friend, during the approval window**

```text
┌ Thu 19 Nov · Hand-build · Willow      │
│ ●──●──●──○──○  Everyone approves      │
│                                       │
│ Approve your $48 hold                 │
│ Studio holds this until 3:58 PM.      │
│ Jordan picks up Sam's piece.          │
│ Cancellation: studio review; full     │
│ refund if the studio cancels. Terms › │
│ ☐ I agree to this session and terms.  │
│   Charged only after everyone         │
│   approves in time.                   │
│ [ Continue to PayPal              → ] │
│ 2 of 6 approved                       │
└───────────────────────────────────────┘
```

**Invited friend, first screen**

```text
┌ rally                                 │
│ Alex invited you to pottery           │
│ Willow Studio · Thu 19 or Fri 20 Nov  │
│ $42–$72 per person · you set your     │
│ own private limit                     │
│ [ Join Alex's plan                → ] │
│   What's on offer ↓                   │
└───────────────────────────────────────┘
```

### Per role

| Role | First screen | Primary action | After the action | Waiting / returning | Remove, move or collapse |
| --- | --- | --- | --- | --- | --- |
| **Organizer** | Plan line + next step. On the first visit, "Add what works for you", then "Invite your friends" with the link. | Changes by stop: add details → share invite → Everyone's in → ask the studio → approve own hold. | The strip advances. The card changes to the next step or a waiting card. | "Waiting on Sam and Jordan" with the reminder as the button. Payment stage shows names. | Drop the 6/7/8 size question at creation. Replace the giant details-saved counter with the People row. Move the roster editor under People. Merge the two offer-page copy buttons. |
| **Invited friend** | The invitation-first card: who invited them, when, price range. | Join → email link → name → details form. | "You're in. Nothing else needed until the studio holds a session." | A waiting card that names what the group is waiting on. During the window: "Approve your $48 hold". | Move the catalog below the action. The login page names the plan being joined. Collapse saved details to one line. |
| **Pickup requester** | Details form, then the next-step card. | Choose a friend → "Ask Jordan to pick up" (sharing note beside it). If a note needs a check, that comes first. | "Waiting for Jordan to answer." | After Jordan agrees: "Jordan will pick up your piece ✓", then normal waiting. If Jordan declines: "Ask someone else". | Move the private session preview into Your details. The answer previews stay inside the note check, where they belong. |
| **Collector** | The request card at the top (wireframe above). | "I'll pick it up" · "I can't do this". | A line in the plan: "You're picking up Sam's piece." | The booked card repeats pickup duty. | Nothing about Sam's note is ever shown (unchanged). |
| **Studio** | Request list, then the review page. Already a single-task screen. | "Reserve & open booking" after four attestations. | The offer page. | Queue rows show "Hold Thu 19 Nov for 6?" | **Leave mostly alone.** Rename the queue rows in action form. |

## 4. Implementation plan

### A. Justified by current structural evidence — do these

**A1. Next-step resolver and single primary slot**

*User benefit:* every person sees their one action first, on a phone, within five seconds.

*Files:*
- New `app/lib/next-step.ts`, holding the resolver above and absorbing `nextStep()` from `app/plans/view.tsx`, so the plans list and the plan page always agree.
- `app/groups/[id]/view.tsx`, recomposed. Ideally split into `plan-shell`, `next-step-card` and the existing components, to break up the 39 KB file.
- `app/globals.css`, for the next-step card style.

*Preserved:* the resolver reads only the viewer's existing projection. No new fields reach the browser. All mutations, consent commands and stale-revision guards are unchanged.

*Acceptance:*
- A fixture matrix covers the fourteen resolver states × organizer, friend, requester and collector.
- Each rendered state has exactly one filled primary button.
- At 375×812 its top edge sits above 600 px.
- The heading equals the plans-list next-step text.
- The existing integration flow still passes.

**A2. One plan shell for plan and offer**

*User benefit:* the plan stays one recognizable object from invite to booking.

*Files:*
- New `app/components/plan-shell.tsx` and `stage-strip.tsx`, used by `app/groups/[id]/view.tsx` and `app/offers/[id]/view.tsx`.
- The group-status mapping in `app/lib/group-status.ts` becomes stop names.

*Preserved:* `/offers/[id]` stays the permanent record for historical offers, payment records and deep links. `Checkout` and its consent checkbox are untouched.

*Acceptance:*
- Both routes show the same title, strip and People row.
- The plan page's approval card reaches PayPal through the existing checkout in one tap plus the consent tick.
- A rendered-text test fails if these internal words appear outside legal or disclosure text: *roster, round, published, qualif, verified approvals, issued, Getting everyone in, Choosing a plan, Studio review*.

**A3. Collapse completed, optional and future material**

*User benefit:* the current step stops competing with everything else.

*Files:*
- `view.tsx`: saved details become a one-line summary row; `PersonalFit` and `FitSummary` move into Your details; `StudioOptions` and the policies move into Terms & timing; `RosterEditor` moves under People; earlier-round notices become a records row.
- `app/components/fit-summary.tsx`: becomes the Your-details header.

*Preserved:* every disclosure that accompanies a commitment stays beside its button. The terms remain reachable from the approval card.

*Acceptance:*
- In every waiting state the page at 375 px is at most two screens tall.
- Only four headings appear above the fold: the plan line, the next step, People, and Your details.
- The eyebrow label pattern is used only for the plan line.

**A4. Absorb organizer administration**

*User benefit:* the organizer's path from "everyone's ready" to "studio asked" is two taps.

*Files:*
- `app/groups/new/page.tsx`: remove the size select.
- `src/intake/service.ts`: `createSchema` no longer requires the size. Close accepts any count within the published sizes, reusing `publishedGroupSizes`.
- The next-step card shows a single fitting session directly.
- `app/offers/[id]/view.tsx`: one reminder that contains the link and deadline.

*Preserved:* the studio minimum and maximum are still enforced on the server. The explicit "Everyone's in" roster decision remains. Studio approval is unchanged.

*Acceptance:*
- The organizer goes from all-ready to a pending studio request in two taps.
- Creating a plan asks only for a name.
- A five-person close is still rejected by the server.

**A5. Invitation-first entry and in-context sign-in**

*User benefit:* an invited friend sees who invited them and the button to join, without scrolling.

*Files:*
- `app/lib/signed-in-entry.tsx`: action first, catalog under "What's on offer".
- `app/login/view.tsx`: the heading names the plan when `next` is a join path.
- Optionally, a public invite-preview read in `app/api/groups/join/route.ts` returning only the organizer's display name.
- Unify "collect" to "pick up" in `app/components/studio-options.tsx`. The catalog's own pickup description is studio text: show it as quoted studio terms rather than rewriting it.

*Preserved:* the invite token remains a secret capability. The preview returns no member list, preferences or group state. Authentication and the same-browser code exchange are unchanged.

*Acceptance:*
- At 375×812 the join button's top edge sits within the first 600 px.
- The login heading reads "Sign in to join Alex's plan" on join paths.
- An invalid invite reveals nothing.

**Order:** A1 → A3 → A2 → A4 → A5. A1 and A3 deliver most of the "feels like an app" change.

### B. Decide only after phone rehearsal or real-group observation

| Decision | Why it waits | Evidence that decides it |
| --- | --- | --- |
| Email-code sign-in | The same-browser failure rate is unmeasured. Custom SMTP probably makes template editing available now, at no cost; verify that against Supabase's settings first. | Team phone rehearsal with WhatsApp and iMessage on iOS and Android. Build it if ≥2 of 6 fail. |
| "Since your last visit" line | Needs per-viewer last-seen storage. The resolver's changing card may be enough. | Returning friends in the study can't say what changed. |
| Whether the private session preview is worth showing at all | It may reassure, or it may distract. | Study participants mention or ignore it. |
| Whether the AI note is used naturally | The pickup selector covers the main example. | Where the traveller expresses the need. |
| Organizer-proposed sessions instead of everyone entering constraints | A bigger model change. | Both groups fail to reach a studio request uncoached after A1–A5. |
| Length of the two-hour approval window | A merchant tradeoff. | Time from first approval to sixth in the study. |
| A five-second test of the new screens | Needs people. | Show each A1 state for five seconds and ask "what would you tap?" Pass: at least 8 of 10 answers correct per state. |

### C. Leave alone

- The payment engine, settlement, compensation and recovery states, and their copy accuracy.
- Consent and disclosure semantics, including the separate collector agreement.
- Privacy projections and the AI boundary, with its evaluation.
- The studio review page.
- The login page layout, which is the reference for the others.
- The visual language: type, colour, spacing.
- The recorded journey, SMTP configuration and judge provisioning.

## Bottom line

The rules engine is finished; the interaction design isn't. One resolver that decides "your next step", one shell that makes the plan the same object everywhere, and the discipline of a single lime button per screen will do more for "it doesn't feel like an app" than any further copy. Until a phone rehearsal and two real groups have used it, the claim that Rally is intuitive remains a hypothesis.
