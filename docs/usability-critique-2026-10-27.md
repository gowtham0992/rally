# Rally usability critique — October 27, 2026

Internal analysis for the owner. Nothing was changed, deployed, published or sent. No judge workspace was claimed, no model or PayPal call was made, and no person was contacted.

**What this is based on.** The current source at `19de8cc` (the live release is `4ac7304`; the later commit only records evidence). The public home, `/demo` and recorded-journey pages, read at phone width today. The October 23 renders of the current clarification and group-fit components in `evidence/web/`. I did not run the authenticated flow live or stand up a local fixture; screen behavior below comes from reading the components and services, and every such claim names the file. **Zero real people have used Rally**, so every statement about what people will do is a hypothesis unless it is a code fact.

## 1. Verdict

Rally is not ready to put in front of an uncoached friend group, and the problem is not wording.

**The single biggest risk is coordination cost with no way to move the group forward.** A first booking needs roughly seventeen separate visits from seven people. Eleven of those are returns that nothing in Rally prompts. One missing or wavering friend stalls everyone, and in several states the organizer cannot even see who the group is waiting on. Rally sends no email, push or SMS at any point (verified: no notification code in `src/` or `app/`). The group chat is the real notification system, and Rally barely helps the organizer use it.

Underneath that sits a motivation imbalance. The benefit, "nobody fronts the bill", lands mostly on the organizer. The cost lands on every friend: email sign-in, a five-part form, a must-haves attestation, a second visit to pay inside a two-hour window. In a group chat those friends do one thing: send $48 to the organizer.

Three findings that are code facts, not hypotheses:

- **A dropout cannot be absorbed.** Group size is fixed at creation; the roster can only close at exactly that size; reopening after a withdrawn offer keeps the same admitted roster (`src/intake/service.ts:207`, `src/bookings/service.ts:79-81`). If one of seven friends can't come, the group can never book in Rally. They must start a new group and everyone re-enters their details.
- **The AI example is mostly pre-empted by the form.** The collection selector directly above the note already offers "I need a friend to collect", with help text saying you can still attend. The note sits in a collapsed "Another must-have" section asking what *the session* needs, and warns that writing in it can hold the group. A friend leaving Friday is steered to the selector, not the note.
- **A default answer blocks the group.** Collection defaults to "I'm not sure yet", which saves successfully and then holds group planning (`app/groups/[id]/view.tsx`, `src/planning/domain.ts:54`).

The engineering of consent, privacy and settlement is sound. The interaction model around it assumes people will come back on their own, in order, and never change their minds.

## 2. The journey by role

Each row is one important transition. "Evidence" separates **code fact** from **hypothesis**.

### Organizer (Alex)

| Transition | Knows | Wants | Rally asks | Likely misunderstanding or abandonment | Evidence |
| --- | --- | --- | --- | --- | --- |
| Arrives from home page | Wants pottery with friends | Book it without chasing money | "Start a group" → email sign-in → name and group size 6/7/8 | Has to commit to an exact headcount before knowing who's in | Code fact: size is fixed at creation, `app/groups/new/page.tsx` |
| Shares invite | Six names in a chat | Everyone responds quickly | Copy link, paste into the chat, then fill in own details | None serious | Code fact |
| Waiting for 6/6 | Counter shows "3/6 Details saved" with per-name status | Nudge the stragglers | Nothing; no reminder text | Will nudge by hand; fine while names are visible | Code fact: roster shows "Adding details" per name |
| "Is this your whole group?" | All six saved | Get to options | Tick six pre-checked boxes, then "Everyone's here — find a plan" | If one friend never saves, the button stays disabled forever. There is no way to proceed with fewer | Code fact: `selected.length===c.targetSize` |
| Collection pending | "One more detail needs attention. … Each friend can check their own private next step below." | Know whom to nudge | Nothing it can act on | **Stalls.** Can't tell who is blocking, so has to ask the whole chat "who still needs to do something?" | Code fact: the organizer isn't party to the arrangement, so `collectionRequests` is empty in their view |
| Session fits | "1 session fits everyone's confirmed choices." | Book it | "Ask the studio" | Probably understood. "Not booked yet" is stated clearly | Oct 23 render |
| Studio reserved | Offer page, "Copy offer link & deadline" | Everyone pays fast | Share the link; approve own share | "Waiting for 2 more verified approvals" names nobody, so the organizer can't nudge the two who haven't paid | Code fact: `app/offers/[id]/view.tsx` progress text |
| Someone drops after the offer | "Withdrawing closes this offer for the whole group" | Rebook with five, or with a replacement | Reopen with the same roster | Cannot rebook. The withdrawn friend is still on the roster | Code fact |

### Invited friend (Riley, Casey, Taylor)

| Transition | Knows | Wants | Rally asks | Likely misunderstanding or abandonment | Evidence |
| --- | --- | --- | --- | --- | --- |
| Taps invite in the group chat | "Alex wants to do pottery" | Say "I'm in" | Landing shows studio, prices, dates; then "Continue to your invitation" → email | Doesn't name Alex or the group. Acceptable | Code fact: `app/lib/signed-in-entry.tsx` |
| Email sign-in | Has an email | Get back to the invite | Open the emailed link **in this browser** | **High risk.** Invites opened inside WhatsApp, Instagram or Messenger use in-app browsers; the email link opens in Safari or Chrome. The code exchange then fails with "That link expired or was opened in a different browser." | Code fact: PKCE `exchangeCodeForSession`; the error copy exists. How often it happens is a hypothesis |
| Details form | Rough budget, which nights work | Be done in 30 seconds | Limit, dates, optional leave-by, activity must-have, collection choice, optional note, a required "These are my must-haves" checkbox | Leaves collection on "I'm not sure yet" and walks away. Rally then shows "One of your must-haves needs an answer" privately, but they've already left | Code fact: default is `UNRESOLVED` and it blocks planning |
| Waiting | Saved | Be told when to pay | Nothing; return on their own | Forgets. Relies on the organizer pasting the offer link | Code fact: no notifications |
| Offer and payment | Link from Alex | Pay their share | Agreement checkbox → PayPal → approve → return → "Your share is authorized, not collected yet." | "Is my $48 gone?" Sees a pending charge in PayPal. "Collected" also means pottery pickup elsewhere in the app | Code fact: "collect" is used for both money and pottery |

### Person needing collection (Sam)

| Transition | Knows | Wants | Rally asks | Likely misunderstanding or abandonment | Evidence |
| --- | --- | --- | --- | --- | --- |
| Fills the form | Flies out Friday | Come Thursday; someone grabs the piece | Collection selector: "I need a friend to collect" → "Who would you ask?" | **Likely chooses the selector, never writes a note. The AI never runs.** | Code fact: the selector and its help text sit above the collapsed note |
| If Sam does write a note | Wrote something like "I leave Friday" | Be understood | Tick "Check my saved note with AI" → "Help me clarify this" → pick an answer → tick "These details and my answer cover every must-have" → "Confirm my answer" | The answer previews are good: both outcomes are visible before choosing. Five interactions for one meaning | Oct 23 render; code fact |
| After confirming "collection only" | "You'll choose someone from the group next" | Pick Jordan now | Go back into the form, choose Jordan, tick must-haves again, save | Expects the picker right there. Has to rediscover it inside the edit form | Code fact: the answer sets a nominee-less collection need |
| Asking Jordan | Picked Jordan | Ask now | Nothing until the organizer closes the roster; then come back, tick share consent, "Ask Jordan to collect" | **An extra return visit.** Sam doesn't know when the roster closes | Code fact: the collection panel is only editable after roster close; the service requires an admitted nominee |

### Nominated collector (Jordan)

| Transition | Knows | Wants | Rally asks | Likely misunderstanding or abandonment | Evidence |
| --- | --- | --- | --- | --- | --- |
| Request arrives | Only if Jordan reopens Rally | Know what they're agreeing to | "Sam would like you to collect their piece." Tick → "I'll collect their piece" | Wants to know when, where, and for how long. The request only says "after firing" | Code fact: no pickup timing or place is shown |
| Saying no | Doesn't want to | Decline gracefully | "I can't collect after all" | Wording implies Jordan had already agreed. Declining feels like backing out | Code fact: the nominee sees this label before agreeing |
| Volunteered? | Was asked by Sam | Not feel signed up | Explicit separate agreement | Good. Jordan only sees anything after Sam explicitly shares it | Code fact; a strength |

### Studio (Willow)

| Transition | Knows | Wants | Rally asks | Likely misunderstanding or abandonment | Evidence |
| --- | --- | --- | --- | --- | --- |
| Request arrives | Nothing until they open `/studio` | A booking | Review the exact session, roster, collection; four attestation checkboxes; "Reserve & open booking" | Clear and appropriate for a merchant. The real risk is commercial: holding capacity for 2.5 hours on a payment the studio doesn't control | Code fact; willingness is unobserved |
| Waiting on payments | Reserved | Know if it's real | "Waiting for everyone's payment approval" | Fine | Recorded screen |

### What the protections feel like

On the happy path there are about **21 confirmation checkboxes**: one per detail save (seven, since Sam saves twice), three for Sam's note and arrangement, one for Jordan, four for the studio, and six offer agreements. Most immediately precede a button that already expresses the same intent. That is what makes the protections feel like an administrative checklist rather than natural decisions. The decisions themselves are right. The checkbox-then-button pattern is the problem.

## 3. Three separate questions

| Question | Current evidence | Judgment |
| --- | --- | --- |
| **Can someone explain Rally after reading it?** | The recorded journey and README state the user, problem, AI question and payment mechanism. The comprehension check is prepared and not run. Jargon remains: "qualifies", "authorized", and "collect" used for both money and pottery. | Probably yes for a careful reader; unmeasured. This is the easiest of the three and the only one the existing materials address. |
| **Can a group finish without coaching?** | Zero observations. Code shows about 11 unprompted returns, a blocking default, a same-browser sign-in requirement, an extra round trip for collection, a fixed roster, and a two-hour payment window. | Unknown, with several known structural failure points. The judge demo hides all of them: one person switching roles skips sign-in, waiting and every return. |
| **Would they choose this over the group chat?** | Nothing. | The hardest question. Today the cost falls on the friends and the benefit falls on the organizer. Expect organizers to like it and friends to tolerate it at best. |

Success on the first question says nothing about the second. A smooth solo demo says nothing about either the second or the third.

## 4. Five changes, ranked

### 1. Show who the group is waiting on, and write the nudge for the organizer — **do this first**

- **Where:** the group heading roster and the organizer section in `app/groups/[id]/view.tsx`; payment progress in `app/offers/[id]/view.tsx`; the per-member projection in `src/intake/service.ts` (group context) and `src/bookings/service.ts` (offer).
- **Observed failure:** after roster close the organizer sees "One more detail needs attention" with no name. During the payment window they see "Waiting for 2 more verified approvals" with no names. Rally has no notifications, so the organizer is the notification system, and Rally gives them nothing to act on.
- **Proposed interaction:** one status line per person, everywhere the roster appears: *Ready · Has a step to finish · Needs to approve their $48*. No reasons, no budgets, no note text. Below it, one button: **Copy a reminder**, which produces:
  > Pottery plan: we're waiting on Sam and Jordan for one step each. Open Rally here: <link>

  During the payment window:
  > The studio is holding Thu 19 Nov for us until 3:58 PM. Still to approve: Casey, Taylor. Your $48 is only charged if all six approve: <offer link>
- **Product-rule tradeoff:** the group learns *that* a named person has an open step or hasn't approved. It never learns *why*. Rally already shows per-name status before roster close, so this extends an existing disclosure rather than inventing a new one.
- **Benefit:** attacks the biggest risk directly and makes an uncoached study possible at all.
- **Validation:** in the study, count organizer chat messages asking "who still needs to…?" and measure how long each stall lasts. Target: no stall longer than 30 minutes caused by not knowing who to ask.
- **Effort:** 1 to 1.5 days.

### 2. Make sign-in survive a link opened from a group chat

- **Where:** `app/login/view.tsx`, `app/auth/callback/route.ts`, the Supabase email template (free-tier configuration).
- **Failure:** code fact: the email link only works in the browser that requested it. Hypothesis: invites tapped in WhatsApp, Instagram or Messenger open in in-app browsers, so many friends will hit "That link expired or was opened in a different browser" on their very first contact with Rally.
- **Proposed interaction:** send a six-digit code alongside the link. "Enter the 6-digit code from your email, or open the link on this phone." Verify the code server-side, so it works in any browser.
- **Benefit:** removes a likely first-contact abandonment for the friends who have the least motivation.
- **Validation:** **measure before building.** In the six-device rehearsal (§7), open the invite from WhatsApp and iMessage on iOS and Android. If two or more of six fail, build it.
- **Effort:** about 1 day.

### 3. Ask the collector in the same visit

- **Where:** the collection panel in `app/groups/[id]/collection.tsx` (editable state), the collection-consent service in `src/intake/service.ts:218-220` and its projection (`:250-258`), and the clarification success state in `app/groups/[id]/clarification.tsx`.
- **Observed failure:** Sam needs three visits: save details, return after the organizer closes the roster to ask Jordan, then pay. After confirming "collection only", Sam has to rediscover the collector picker in the edit form. Jordan's request gives no timing or place, and the decline label is "I can't collect after all".
- **Proposed interaction:**
  - Right after "Confirm my answer", show the picker inline: *Who could pick up your piece? [Jordan ▾] — Ask Jordan.* One button. It states that this shares the arrangement with Jordan, and with the studio if you book.
  - Allow the request as soon as both people have joined, not only after the roster closes.
  - Jordan sees: *Sam is flying out and asked if you could pick up their fired piece from Willow Studio. The studio says pieces are ready after firing; they'll contact the group.* Two buttons: **I'll pick it up** / **I can't do this**.
- **Product-rule tradeoff:** an agreement can now exist before the roster is final. If Jordan isn't in the final roster, the arrangement is invalidated and Sam is told to ask someone else. The existing revision and admission checks already invalidate stale arrangements; the new part is allowing creation earlier.
- **Benefit:** removes one full round trip for Sam and usually one for Jordan.
- **Validation:** count Sam's and Jordan's visits and the minutes from Sam's save to Jordan's agreement.
- **Effort:** about 1.5 days including consent-invariant tests.

### 4. Let the group continue when someone drops

- **Where:** the roster-close rule in `src/intake/service.ts:207`, the new-group size choice, and the reopen transition in `src/bookings/service.ts:73-82`.
- **Observed failure:** group size is fixed; the roster can only close at exactly that size; reopening keeps the withdrawn person. One dropout ends the group in Rally.
- **Proposed interaction:** before roster close, the organizer can mark someone *Not coming this time* and the target becomes the number still in, within the studio's 6–8 range. When reopening after a withdrawal, the organizer chooses who is still in. The removed person sees *Alex updated the plan: you're not in this round.* Any collection arrangement involving them is invalidated, and the affected person is told.
- **Product-rule tradeoff:** the organizer gains the power to remove people. Removal must be visible to the removed person and can never touch a live offer.
- **Benefit:** the most common real-world change, someone who can't come, stops being fatal.
- **Validation:** a scripted dropout in group two of the study (§6, stage 3).
- **Effort:** about 2 days. Build the pre-roster-close part before recruiting; the reopen part can follow.

### 5. Turn confirmations into the actions they confirm, and fix the misleading defaults and words

- **Where:** the details form in `app/groups/[id]/view.tsx`, `clarification.tsx`, `collection.tsx`, `app/offers/[id]/checkout.tsx`, `app/components/booking-rules.tsx`, and the home page.
- **Observed failures:**
  - About 21 checkboxes on the happy path.
  - "I'm not sure yet" is the default collection answer and silently blocks the group.
  - "Collect" means both PayPal capture and pottery pickup.
  - The note is collapsed, framed as a session requirement, and warned against.
- **Proposed changes:**
  - Remove the "These are my must-haves" checkbox. The button becomes **Save my details**, with one line beneath it: *Rally will only suggest sessions that meet these.*
  - Merge the AI consent checkbox into its button: **Check this note with AI**, with the existing data-sharing line beneath it.
  - Merge the meaning confirmation into its button: **Confirm: I can attend, someone picks up my piece.**
  - Merge the share consent into **Ask Jordan** (see change 3).
  - Keep the studio's four attestations and the payment agreement. Those are commercial and financial commitments.
  - Collection becomes a required choice with no preselected answer. If someone genuinely isn't sure, the help text says: *Your group can't ask the studio until you decide.*
  - Use **charge** for money and **pick up** for pottery throughout. Checkout becomes: *PayPal places a $48 hold. You're only charged if all six approve by 3:58 PM. Otherwise the hold is released.*
  - Note label: **Anything else about your plans? Optional · Private.** Expanded by default, no example wording, no warning. If the note is non-empty when the person saves, offer the AI check immediately in the same view.
- **Product-rule tradeoff:** removing the must-haves checkbox drops an explicit "my list is complete" attestation; Save takes on that meaning. A neutral note label will produce more notes, so more groups wait on a check. That is acceptable only because the check now happens in the same visit.
- **Benefit:** fewer interactions, no silent blocker, clearer money language, and an honest test of whether the AI arises naturally.
- **Validation:** time to complete the details form; whether the traveller writes a note unprompted; whether each friend can answer "has your $48 been taken?"
- **Effort:** about 1 day.

**Observed versus hypothesis.** Changes 1, 3, 4 and 5 fix code-level facts; their effect on people is a hypothesis. Change 2 fixes a code fact whose frequency is a hypothesis, which is why it is gated on the rehearsal.

## 5. Where the work can shrink

| Remove, merge or delay | Keeps | Rule change? |
| --- | --- | --- |
| Must-haves checkbox on every save | Private requirements | Yes: Save becomes the attestation |
| AI consent checkbox, meaning checkbox, share-consent checkbox → the buttons themselves | Explicit consent, as a deliberate press | No |
| Sam's second save to choose a collector → inline picker | Explicit nomination | No |
| Wait for roster close before asking a collector → ask once both have joined | Two-party consent | Yes (change 3) |
| Organizer re-ticking six pre-checked names → "Everyone's in — find a session" with names listed | An explicit roster decision | No |
| Exact-size roster → size within the published range | Merchant capacity rules | Yes (change 4) |
| Separate "Check our options" visit | — | Already automatic after roster close |
| Studio's four attestations | — | Keep: merchant commitment |
| Offer agreement before PayPal | — | Keep: financial consent |

**Not recommended:** removing private budgets, auto-agreeing collectors, or letting anyone pay for another person. Those are the product.

**Worth naming:** the two-hour payment window is a merchant rule with a usability cost. Six people must each complete PayPal within two hours of an arbitrary studio approval, with no notifications. Keep it for now and measure time-to-six in the study. If groups can't do it, the fix is letting the organizer choose when the request reaches the studio, so the window opens at a time the group has agreed in chat, rather than lengthening the hold.

## 6. A small uncoached study

Two friend groups. A third if one fails for an infrastructure reason. **This is directional evidence about usability, not evidence of demand.** Synthetic personas and model reviews can generate hypotheses before this; they do not count as results.

**Recruitment (neutral).**
- Existing friend groups of six adults who have planned at least one paid group activity in the past year.
- At least one person per group who has paid for the group and been reimbursed.
- Mixed iOS and Android, everyone on their own phone and own email, with an existing shared group chat they actually use.
- Exclude anyone who has seen Rally or works on it. Do not mention AI, PayPal holds, or "nobody fronts the bill" when recruiting.
- Recruitment line: *"We're testing an app for planning a group activity. It takes about 15 minutes of your own time spread over two days, plus one short follow-up call. No real money."*

**Setup, not coaching.**
- A local or non-judge hosted group with the fictional Willow catalog.
- Each participant receives a printed card with one **sandbox** PayPal buyer login, labeled as test credentials. Never their real PayPal.
- The studio is played by a team member who approves within 15 minutes of a request. Log it as setup.

**Task brief, read once to the organizer only:**
> You and five friends want to do a pottery session at Willow Studio. You'd rather not cover everyone and collect money afterwards. Use Rally to get the group booked. Coordinate however you normally would.

To everyone else:
> Alex will send you something about a pottery plan. Respond however you normally would.

**Private role cards.** Hand them individually. Never show the expected answers.

| Role | Private information |
| --- | --- |
| Organizer | Can do Thursday or Friday evening; would spend up to $60; open to any activity. |
| Friend A | Can do Thursday or Friday; would spend up to $50; wants to make something they can actually use. |
| Friend B (traveller) | Can come Thursday evening. Flying out early Friday for two weeks. Doesn't know how the studio's pickup works. Up to $55. |
| Friend C | Either night; up to $80; doesn't care what activity. |
| Friend D | Thursday only; up to $70. Would help a friend if asked, but dislikes being signed up for things without being asked. |
| Friend E | Either night; up to $55; prefers not to say their budget in the chat. |

There is exactly one workable outcome: Thursday hand-build at $48, with someone collecting for B. Nobody is told this.

**Stages.**
1. **Planning, asynchronous, 48 hours.** From invite sent to studio request.
2. **Payment, live, one 2-hour window.** Everyone on a 20-minute call when the studio reserves; they approve on their own phones.
3. **Group two only: change of mind.** Before stage 2, give Friend C a card: *"You can't make Thursday after all."* Observe what the group does.

**Coaching** is any moderator words or actions that tell a participant:
- which control to use,
- what a status means,
- that they need to return to Rally,
- or that something "isn't broken".

**Not coaching:**
- reading the brief verbatim,
- handing out sandbox credential cards,
- restoring a verified outage (log it separately as infrastructure).

Every coaching event is logged with a timestamp, and the group's result is then reported as coached.

**What to observe.**
- Where B records the travel constraint: the collection selector, the note, the chat, or nowhere. **This is the natural-AI test.**
- Whether the AI check runs at all.
- Whether D feels volunteered.
- Each sign-in failure, with the app the link was opened from.
- Every chat message that asks who or what the group is waiting on.
- Each stall longer than 30 minutes and its cause.
- What each person says has happened to their $48 after authorizing.
- What the group does after C's change of mind.

**Measures.**
- Completion to studio request without coaching. Completion to six authorizations in the window.
- Elapsed time from invite to request. Minutes from first authorization to the sixth.
- Abandonments by step.
- Comprehension, asked privately when the offer is open:
  1. Who can see your spending limit?
  2. Is the group booked yet?
  3. Has any money left your account?
  4. What happens if one person doesn't approve?
  5. *(Collector only)* What did you agree to?
- Preference, asked separately after the study: *"Next time, Rally or your usual way? Why?"*

**Pass and fail thresholds** (directional, small n):

| Measure | Pass | Fail → what to change |
| --- | --- | --- |
| Reach studio request uncoached | Both groups, or one plus an infrastructure-only failure | Neither → coordination model is too heavy; go to §8 |
| Stalls from not knowing who to ask | None over 30 minutes | Any → change 1 is insufficient; add per-step reminders |
| Sign-in failures | 0–1 of 12 people | ≥2 → build change 2 before anything else |
| Six authorizations inside the window | At least one group | Neither → let the group choose when the window opens |
| "Has money left your account?" answered correctly | ≥10 of 12 | Fewer → rewrite hold copy; show the hold amount and release time |
| Collector understands the agreement and doesn't feel volunteered | Both collectors | Either fails → rework the request wording |
| Traveller uses the note unprompted | Any | Neither → the AI is not naturally part of the flow; see §8 |
| Organizer prefers Rally and at least 3 of 5 friends would not object | Both groups | Fewer → the motivation problem is real; see §8 |

## 7. Fresh-browser rehearsals

These are two different experiences. Run both and keep their results separate.

### A. Solo reviewer: the judge path

- **Who:** one person who has never used Rally, given only the `/demo` page text and a code.
- **Setup:** fresh browser profile, no cookies, desktop. A second run at phone width.
- **Authorization needed:** this consumes one judge workspace and makes one real AI call through Astropods. The owner must approve both.
- **Timer:**

| Split | Starts | Stops |
| --- | --- | --- |
| Wake | Typing the `/demo` URL | Page becomes interactive |
| Access | Wake ends | Code accepted and the first friend's page is open |
| Product | Access ends | Studio offer page shows "The studio has reserved your session" |

- **Checkpoints to timestamp:** Alex saved · Sam saved · note checked · answer confirmed · collector chosen · roster closed · Sam asked · Jordan agreed · session requested · studio reserved.
- **Classify every delay:**
  - **Infrastructure:** cold start, any 5xx, any spinner over 5 seconds, code rejection.
  - **Access:** role switching failures, stale-tab errors.
  - **Product confusion:** more than 30 seconds on a screen without acting, a wrong control, backtracking, or a think-aloud question about meaning.
- **Pass:** product time ≤10 minutes with no product-confusion stop longer than 2 minutes. Wake time is reported, not passed or failed.
- **Already observed today:** the Render "Application loading" screen lasted about 30 seconds before the home page appeared.
- **Limitation to state in results:** this path skips email sign-in, waiting and every return visit. It cannot show that friends can coordinate.

### B. Six devices: the friend path, run by team members

- **Purpose:** remove infrastructure blockers before naive participants see Rally. It is not a usability result.
- **Setup:** six phones with fresh browsers, real email sign-in, a non-judge hosted group, the invite posted into a real WhatsApp or iMessage group and opened however each phone opens it.
- **Timer:** starts when the organizer taps "Start a group"; stops when the studio reserves. Time the payment window separately.
- **Record:** every sign-in failure with the app the link was opened in; every point where someone didn't know it was their turn.
- **Pass:** all six sign in without help; the request is reached; all six authorize in the window.
- **Purpose of the result:** this is where the change-2 decision is made.

## 8. Decision

**Change before recruiting anyone:**
- Change 1 (waiting-on visibility and reminder text): first.
- Change 5 (confirmations, defaults, money words, neutral note).
- Change 3 (collector in one visit).
- The pre-roster-close part of change 4.

Roughly four to five days. Then run both rehearsals, decide change 2 from rehearsal B, and recruit.

**Observe before changing anything else:**
- Where the traveller puts the travel constraint.
- Whether groups stall, and on what.
- Whether friends understand the hold.
- Whether the organizer would use it again.

Do not touch payments, add features or polish visuals until those four are seen.

**Reconsider or simplify the product if:**
- **Neither group reaches a studio request without coaching, even after changes 1, 3 and 5.** Then the "everyone enters constraints, the planner finds a session" model is too heavy. Invert it: the organizer proposes one or two published sessions, and each friend privately answers *Works for me / Doesn't fit my budget / Can't make that time / Need someone to pick up*. That keeps private budgets, collection consent, studio approval and the hold-then-charge settlement, and removes most of the form. The cost is that the planner becomes a checker of the organizer's proposal rather than a finder.
- **No traveller uses the note in either group.** Then the AI clarification is not naturally useful in its current position, and it should not be claimed as a usability benefit. The honest path is either to make the AI reduce work (friends describe what they need in one sentence and the AI drafts the activity and pickup choices for them to confirm, while budget and dates stay as fields) or to present the AI as a safety net that rarely fires. The first requires re-running the AI evaluation for the new input. Do not attempt it before November 12 unless the study is complete by November 3.
- **Organizers like it but most friends say they would rather just send $48.** Then the motivation imbalance is real. The product is an organizer tool, and friend-side effort has to fall to roughly "tap, confirm, approve" before it is worth adopting.

**On the timeline:** the deadline is November 12, and the owner plans video work in the final week. That leaves October 27 to about November 4 for usability: changes by October 30, rehearsals October 31, two groups November 1–3, fixes November 4. If recruitment slips, ship changes 1, 3 and 5 anyway. They fix code-level facts. State plainly in the submission that no real group has used Rally.
