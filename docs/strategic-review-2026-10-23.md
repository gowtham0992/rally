# Rally strategic review — October 23, 2026

> Historical record. This document describes its original checkpoint or proposed
> study, not current product instructions. Start with the [documentation](README.md)
> or [development history](history.md) for context.

Internal review for the owner. It restructures Rally for the PayPal AI Hackathon (submissions close November 12, 2026, 12:00 Pacific; judging December 1–15). It authorizes nothing: no publication, Devpost edit, payment, outreach or deployment happened as part of writing it.

Everything below was checked today against the repository, the live preview, the public Devpost page, the official rules page and the primary sources named inline. Where a statement is a judgment rather than an observation it says so.

## 0. The uncomfortable verdict

Rally passes the rules' Stage One (theme fit, real PayPal sandbox use, real AI use) without question. It is **not currently a credible grand-prize contender**, and it is a weak honorable-mention contender, for one reason that is not about the product's quality:

**A reviewer who follows the published entry point never experiences the thing Rally is good at.**

Observed today:

| What a reviewer meets first | Observation |
| --- | --- |
| Public Devpost page | Repository link points to `gowtham0992/rally-hackathon`, which was deleted on October 3. Description says 123 tests, 22 mutations, and that the six-buyer flow and genuine webhooks "are still pending". No video. |
| Hosted preview | Cold start: `/api/health` took 43 seconds today. |
| `/demo` | A password field. Nothing explains what is behind it before the code is entered. |
| Public path without the code | Email magic-link sign-in, then a new group. Every offering requires six people, so a lone reviewer can never reach a candidate session, an offer, or a payment. |
| Repository | Private. The best single screenshot of the product (the confirmed six-person booking) is in the git-ignored `evidence/private/`. `evidence/web/` holds about 600 files, most of them per-release audit logs. |
| README | Leads with the access code, workspace scarcity and cold start; then a verification table whose first row is the older three-buyer proof. Test count (151) differs from the current suite (179 by static count) and from the Devpost page (123). |

The rules say judges "may choose to judge based solely on the text description, images, and video provided". Under that clause Rally today is judged on a stale description, no video, and a README that opens with operational caveats. The engineering behind it is genuinely strong; it is simply not on the path a reviewer walks.

**Most likely reason for losing, in order:** (1) the defining moment is never seen; (2) the idea reads as "split a group booking" which exists in booking software and adjacent to PayPal Pools; (3) Potential Impact has nothing but a hypothesis behind it and the copy says so repeatedly; (4) the hedged, audit-style prose makes the entry look unfinished to a text-only reader even where it is finished.

Secondary observation from the git log: after the owner's October 3 instruction to stop demo work and "finish the product", there are 30 commits. Fifteen are release-record commits; the other fifteen are product commits, every one of them about recovery, restart, decline, draft retention or sign-in expiry. Several improve the clarity of those edge states, which is real work. None touched the home page, the demo entry, the README, the Devpost page, or made the clarification's consequence visible. That is the pattern you suspected, and it is supported, not hypothetical.

## 1. Diagnosis against the five criteria

Provisional judgments. Not official scores.

| Criterion (rules wording) | Strongest evidence we hold | Weakest claim | Likely skeptical reading |
| --- | --- | --- | --- |
| **Technological Implementation** — thorough, skillful use of PayPal and AI; working, non-trivial | Six distinct sandbox buyers, six AUTHORIZE orders, six verified captures, 12 genuine signed webhooks processed, a delivered duplicate left state unchanged (`evidence/web/hosted-six-friend-settlement.json`, `hosted-webhook-retransmission.json`). Three-buyer compensation and lost-response recovery with independent provider GETs. 179 tests, 40 caught mutations. | "AI is central." The model does one bounded job (one grounded clarification with four question templates). | "Excellent payments engineering; the AI is a form helper." This is the criterion Rally should win outright, and it is also the tie-break criterion in the rules. |
| **Design** — complete, coherent product, not a proof of concept | Coherent friend/studio product with truthful states (Booked / Booking window / Checking payments / Canceled), frozen offer page, consent flow, phone layouts. | The first screen a friend meets is one long form; the AI moment sits two-thirds down it. The demo requires seven role switches and six PayPal logins to "finish". | "Complete but heavy. I didn't finish." |
| **Potential Impact** — credible, specific case for a real audience, addressed by what is demonstrated | A concrete, recognizable situation (private budget, someone leaving town, nobody wants to front $288). | Zero humans, zero studios, and the materials say so five or six times. | "Hypothesis, not impact." The honesty is right; the repetition of the disclaimer is self-sabotage. Say it once, precisely. |
| **Innovation/Idea** — creative, novel, differs from existing concepts | Authorize-then-capture used as a *group commitment device*: six holds, zero captures until everyone qualifies, compensation if not. Private constraints shaping a merchant-approved offer. | "Nobody fronts the bill." Booking vendors already offer per-guest split pay (see §6). | "Group split-pay with extra steps." Must be reframed around the hold-until-everyone mechanism and the fit-check, not the split. |
| **Presentation** — video shows end-to-end; pitch says problem, audience, why | A good 155-second shot list exists. | No video. The review cut is stills plus synthetic narration, which a multimodal judge may read as a slideshow. | Fails on absence. |

## 2. Why the previous three lost: competing explanations

**Supported by your own project materials (not by judge feedback):**

1. In all three, the frictionless path was seeded or sample behavior and the real path needed sign-in or a 45-minute install. Reviewers take the frictionless path and score what they saw.
2. Taglines assumed context (OpenClaw; "independent release checks"). The reader had to learn the domain before learning the benefit.
3. The visible output was a property (an approval was correctly refused; a release was correctly gated), not an artifact the user wanted (the calendar event, the repaired model shipped, the packet approved).

**Plausible hypotheses, not established:**

4. Hedge-dense prose scores badly under "credible, specific case" when a model is doing first-pass screening. A sentence like "we have not validated demand" is correct, but ten of them make the entry read as a draft.
5. Track fit. Nightwatch in Taskmaster competed against an entry with physical hardware and blind evaluations; that is a field-strength loss, not a product loss.
6. Base rates. Hundreds of entries, roughly eight to twelve awards. A top-decile entry loses most of the time. Three losses are consistent with three top-decile entries and with three mediocre ones; they do not discriminate.

**Where you may be mistaking complexity for value:** an approval broker, an independent release check and a compensation engine are things a user *never sees working*; they see the absence of a bad outcome. Winners with deep safety work (Warrant, Overturn, Sentinel, OneDecision) put the safety inside a visible positive result. Rally has exactly this problem: the refund-and-void engine is invisible on the happy path, and the happy path is the only thing a judge will watch. Your engineering was probably better in several matchups. "Better engineering" was never the criterion; "better evidence of a result" was.

## 3. The recommended version of Rally

**Keep the product. Change what it is said to be, and move one computation to the surface.**

Framing: *Rally books a group only when the plan fits everyone — and PayPal holds each person's share until it does.* Audience stays: friends booking one private studio session, and the studio.

Core experience, in the order a reviewer must see it:

1. **The fit check.** Each friend's private limit and must-haves either fit a published session or do not. The screen says which, without revealing anyone's numbers.
2. **The question that changes the answer.** Sam writes "I leave Friday." Rally asks one question. The two answers lead to two different group outcomes, and the screen shows both before Sam answers: *"If you can't attend: no session fits this group of six. If you can attend and someone collects: Thursday hand-build, $48, fits."* That preview is computed by the existing deterministic planner; today it only computes the branch after the answer. This is the single product change that is essential (§5).
3. **The studio's exact reservation**, then **six holds, one booking**: "6 of 6 payment approvals verified" → Booked. No capture before all six qualify.
4. **What happens if someone fails**: one labeled, separate recording of the three-buyer refund-and-void.

Why it beats the current framing: it names the mechanism PayPal makes possible (authorization holds as group commitment), it gives the AI a decision with a countable consequence, and it is a sentence a one-minute judge can repeat. What it sacrifices: the privacy story and the recovery engineering become supporting evidence instead of headline. The cancellation, round-restart, and sign-in-recovery work stop being mentioned above the fold at all.

## 4. Evaluation under four review conditions

| Reviewer | What they will actually consume | What they could miss or misread | Fix |
| --- | --- | --- | --- |
| **Text-only model** reading description + README | First ~300 words of each, headings, tables, numbers. | Contradictory counts (123/151/179), "pending" statements that are no longer true, no mechanism sentence; it will summarize Rally as "group booking with sandbox payments; limitations: no users, several open gates". Cannot see images. | One dated truth table. First 150 words contain audience, problem, mechanism, the AI decision, one verified number. Captions on every image. |
| **Multimodal model** watching the video | Frames, on-screen text, narration. | Stills + synthetic voice read as a mockup. Role switching looks like one person doing everything. Six identical PayPal approvals look like padding. | Real screen recording. Persistent "Viewing as Sam" chip (exists). Show approvals 1, 2 and 6 with a visible counter. Open on the question, not on setup. |
| **Technical reviewer** in the repo | README, `src/payments/engine.ts`, tests, evidence. | Repo is private today. 600 audit files bury eight that matter. Setup needs Docker, Supabase, PayPal sandbox, Astropods; they will not do it. | Public repo. A ten-minute path: `npm ci`, Docker Postgres, `npm test` (simulated provider, no external accounts — already true, say so). An `evidence/README.md` with eight links. |
| **Human with one minute** | Devpost tile image, tagline, first paragraph, maybe 20 seconds of video. | "Split the bill, PayPal has Pools." Password field. Spinner. | Tile = confirmed booking screen with "6 of 6" and "$48 fits · $72 doesn't". Tagline = the mechanism. A no-code recorded journey one click away. |

## 5. Restructuring plan

### Product changes (build only these)

| Change | Weakness resolved | Visible result | Effort |
| --- | --- | --- | --- |
| **Consequence preview at the clarification** — run the planner for each answer option and show the group outcome per option before confirming. | AI reads as peripheral. | The question visibly decides between "no session" and "$48 Thursday with Jordan collecting". | 1–2 days. Planner and personal-fit already exist; this is a projection plus UI. |
| **Fit summary above the form** on the group page: "Your limit fits 2 of 3 sessions" / "Waiting on one answer" / "No session fits yet". | First screen is a wall of inputs. | The benefit appears before the work. | 0.5–1 day. `personalFit` already computes it. |
| **Layered judge path**: Layer 0 recorded journey (no code), Layer 1 live planning + AI + studio approval (code), Layer 2 live payments (code + sandbox buyers). State at `/demo`, before the password field, what each layer shows. | Judge quits at the password field or at the sixth PayPal login. | A reviewer can stop after Layer 1 and still have seen the product. | 0.5 day of copy and structure. |
| **Provision more judge workspaces** with the existing offline command (at least ten total untouched). | Three untouched workspaces for an unknown number of judges. | No judge is turned away. | 0.5 day; Supabase Free allows it. |

Do not build: more agents, more activity types, a chat ingester, dashboards, live money, any paid tier.

### Evidence-discovery changes

| Change | Weakness resolved | Visible result | Effort |
| --- | --- | --- | --- |
| **Recorded journey page** (static, in `public/`): twelve real screenshots from the October 3 hosted run plus the settlement and duplicate-webhook JSON, each captioned, each labeled "Recorded 3 Oct 2026 · fictional group · PayPal sandbox". Linked from the home page footer, `/demo`, README line 3, Devpost. | Private code, cold start, no-code reviewers. | The whole product is inspectable in two minutes with nothing to run. Not a simulation and never presented as live. | 1 day. Assets exist; move the needed ones out of `evidence/private/` after a secrets check. |
| **One dated truth table** (README + description + `evidence/README.md`): buyers, captures, webhooks, tests, mutations, hosted recovery status, human validation = 0. | Contradictory numbers. | No reviewer reconciles anything. | 0.5 day. |
| **Evidence index** with eight entries; move per-release audit artifacts to `evidence/releases/` (keep history, change the path a reader lands on). | 600 files hide the eight that matter. | A technical reviewer finds proof in one click. | 0.5 day. |
| **State the no-external-account test path** explicitly. | Reviewers assume setup needs PayPal and Supabase. | `npm test` runs in ten minutes with Docker only. | 15 minutes. |

### Final packaging (owner-controlled)

| Change | Weakness resolved | Effort |
| --- | --- | --- |
| Record the real video from the existing shot list, reordered: 0–20s the question and both outcomes; 20–60s fit check and studio reservation; 60–120s six holds → booked; 120–150s the labeled recovery recording; 150–165s the sentence. | No video. | 2–3 days including retakes. |
| Fix the Devpost repository URL, description, tool list, tile image, testing instructions, and add the code to the private field only. | Stale, contradictory public page. | 0.5 day after the above. |
| Publish the repository (owner decision) after the existing secret-scan routine on the final revision. | Required for eligibility. | 0.5 day. |
| Say the human-validation gap once, precisely, in "What we have not tested". Delete every other repetition. | Hedge density. | 1 hour. |

### Stop spending time on

- Further sign-in-expiry and connection-failure preservation work. It is done and nobody will score it.
- Additional mutation checks and test-count growth.
- A hosted re-run of partial-failure recovery. The three-buyer local proof with provider GETs is sufficient when labeled honestly. Run it only if everything above is finished before November 8.
- Paid hosting debates. Render Free's cold start is a stated fact in line one of the instructions; the recorded journey makes it survivable.

## 6. Strongest defensible differentiation

Checked today against primary sources:

| Alternative | What it does (source) | What Rally does differently |
| --- | --- | --- |
| **PayPal Pools** | Organizer creates a pool; contributions accumulate separately, then the organizer transfers to their own balance and spends from there. No booking, no requirements, no conditional behavior described. ([PayPal](https://www.paypal.com/us/digital-wallet/send-receive-money/pool-money)) | Money never passes through a friend. Each share is a separate PayPal authorization to the merchant; capture happens only after all six qualify. |
| **Venmo Groups / Splitwise** | Track and net expenses after someone has paid. ([Venmo help](https://help.venmo.com/hc/en-us/articles/22900416466067-Adding-and-editing-group-expenses-)) | Nobody pays first, so there is nothing to split afterwards. |
| **Booking-vendor split pay** (Xola, Easol Group Pay, TripWorks) | Organizer starts the reservation and invites others to pay portions; Xola can "automatically charge the organizer" for unpaid balances. ([Xola](https://support.xola.com/split-payment-purchases), [Easol](https://easol.com/muse/introducing-group-pay)) | Nothing precedes the checkout in those systems: no private constraints, no feasibility check, no merchant-approved frozen terms, and the organizer still backstops the balance. Rally's organizer backstops nothing. |
| **Ordinary merchant checkout** | One payer, one order. | Six payers, one reservation, one atomic-looking outcome built from separate authorize/capture/void/refund operations. |

So the honest claim is: *the combination* of private requirement capture → one grounded clarification → merchant-approved frozen offer → per-person authorization holds → capture only when everyone qualifies → compensation otherwise. Do not say "first" or "unique". Say "unlike Pools and split-pay checkouts, nobody fronts and nobody backstops."

Note for prize targeting: "Best Use of Agentic Commerce" is an honorable mention Rally will not win and should not chase; Rally's AI has no payment authority by design. "Best Use of PayPal + AI", "Best Demo Delivery" and the Render sponsor prizes are realistic targets if the restructuring lands.

## 7. Proof map

| Claim | Status | Artifact or action |
| --- | --- | --- |
| Six distinct buyers, six $48 captures, $288 gross, booking confirmed | Existing, hosted, Oct 3 | `evidence/web/hosted-six-friend-settlement.json`, `hosted-six-settlement-resources.json` |
| 12 genuine signed webhooks processed; delivered duplicate left state unchanged | Existing, hosted, Oct 3 | `evidence/web/hosted-webhook-retransmission.json`, `verified-delivered-resend.json` |
| Forged signature rejected on hosting | Existing, Oct 3 | `evidence/hosted-webhook-signature-denial.json` |
| Partial failure → refund + voids; lost response → no double capture | Existing, local service + real sandbox, three buyers | `evidence/paypal-sandbox/index.html`, `verified-*.json` |
| Hosted partial-failure recovery | **Unverified** | Label as such; optional late run |
| AI: 24 cases × 3, 72/72, zero safety failures, two earlier failed runs retained | Existing, Oct 2 | `evidence/ai/evaluation-index.json`, `public/evidence/ai/index.html` |
| AI question changes which session is feasible | True in logic; **not yet visible on screen** | Build the consequence preview; capture one screenshot |
| 179 tests, 40 mutations caught | Existing, Oct 10 local | Re-run once on the final revision and date it |
| Judge access works end to end in a fresh browser | **Not recorded** | One rehearsal, screen-recorded, before Nov 12 |
| Any human found it easier | **Unverified; count is zero** | Say so once. Do not run agent personas as a substitute. |
| Studio would hold capacity for two hours | **Unverified** | Say so once. |

How to make the best evidence easy to meet without disguising a recording as live: every recorded asset carries the same three-part label (date · fictional group · sandbox), lives on one page, and the live demo page links to it with the words "recorded" and "live" used only in their literal senses.

## 8. The defining moment

Sam, on a phone, has typed "I leave Friday." under "Anything else we should know?" and saved. The page shows the quoted words and one question: *Does leaving affect attending the session or collecting your piece afterward?* Under the two radio options are two short outcome lines, computed live by the planner: *"I can't attend" → No session fits this group of six.* / *"I can attend; I need someone to collect" → Thu 19 Nov, hand-build a cup, $48 per person, fits — if someone in the group agrees to collect.* Sam picks the second. Jordan's screen gets one request and one Agree button. The organizer's group page changes from "Waiting on one answer" to "Thursday hand-build fits everyone · $48". That is the whole value in four taps, and every number on screen comes from the studio's published catalog, not the model.

## 9. Prioritized plan to November 12

Twenty days. One person.

| Days | Do | Done means |
| --- | --- | --- |
| 1–2 | Consequence preview + fit summary. Tests for the projection. Deploy. | Screenshot of §8 exists from the live site. |
| 3 | Recorded-journey page; move/clean the needed screenshots; secrets check. | Reachable without a code; linked from home, demo, README. |
| 4 | Truth table; README rewrite (first 150 words rule); evidence index; releases moved. | No two documents disagree on any number. |
| 5 | Layered judge copy; provision ten workspaces; fresh-browser rehearsal recorded. | A stranger with the code reaches studio approval in under ten minutes. |
| 6–8 | Record and cut the video. | Under 180s, real interactions, public YouTube, plays signed out. |
| 9 | **Comprehension test** (below). Fix what fails. | Pass criterion met or framing revised. |
| 10 | Devpost page: links, description, tile, testing field. Owner publishes repo. | Page matches README matches video. |
| 11–20 | Buffer: retest access weekly; optional hosted recovery run; nothing new. | Entry unchanged after day 12 unless a defect is found. |

**Comprehension test that can falsify the framing.** Give three people who have never seen Rally (or, failing that, three models from different vendors with no prior context) only the README's first screen and the recorded-journey page. Ask, in writing, five questions: Who is it for? What stops the group from booking? What did the AI decide and what changed because of it? Why does PayPal matter here rather than any processor? What happens if the fifth person's payment fails? **Fail criterion:** if two of three cannot answer the third and fourth questions in one sentence each, the framing is wrong, not the reader, and the mechanism sentence and the consequence preview must be redone before anything else.

## 10. The strongest case against this recommendation

The entry that beats a restructured Rally is a consumer or merchant flow with **real people in the video**: a real small merchant's catalog, a real group of friends on camera, PayPal in the middle, an agent that does more than ask one question, and a pilot statement from a named merchant. Against that, Rally's fictional studio and synthetic friends read as a prototype however clean the payments are. A second threat is a native agentic-commerce entry built on PayPal's newer agent-facing surfaces, which will own the "Best Use of PayPal + AI" conversation with judges who work at PayPal.

Evidence that should make you pivot rather than polish:

- The comprehension test fails twice after the consequence preview ships.
- Three real friends try Layer 1 and the clarification never fires naturally or feels like a chore; the AI then is peripheral in fact, not just in appearance.
- PayPal or Venmo announces group-pay-to-merchant with holds before judging.
- The judge path cannot be made to work in a fresh browser in under ten minutes.

If none of those happen, the strongest realistic outcome is an honorable mention or Render sponsor prize with a genuine shot at a top-three placement on the Technological Implementation tie-break. Promising more than that would require evidence we do not have.
