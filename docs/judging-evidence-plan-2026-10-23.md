Rally should make one outcome immediately clear: friends find a studio session that fits their private requirements, review one fixed merchant offer, and each approve their own payment. The next improvement should reduce the effort needed to understand and verify that outcome.

> Historical record. This document describes its original checkpoint or proposed
> study, not current product instructions. Start with the [documentation](README.md)
> or [development history](history.md) for context.

This is the October 23, 2026 product and evidence plan derived from the [34-winner study](../../research/winner-study-rally-2026-10-23.md). It is an internal recommendation, not a Devpost submission, a demo script, or a claim that Rally will win. The owner continues to control submission and publication.

PayPal evaluates implementation, design, impact, innovation, and presentation equally. [Official rules](https://paypalaihackathon.devpost.com/rules). Winning entries across the comparison events often make each claim traceable to something a reviewer can inspect. The implication is to improve the path from claim to proof before expanding scope.

The product remains for friends arranging one private pottery session and the studio reviewing that session. The current alternative is a group chat, someone negotiating requirements and collecting money, and a merchant booking process. Demand, willingness to use the workflow, and acceptance of the reservation hold have not been established with real groups or studios.

**The central product distinction**

“Nobody fronts the bill” is useful but insufficient by itself: [PayPal Pools](https://www.paypal.com/us/digital-wallet/send-receive-money/pool-money) already supports collecting money in advance. Rally needs to make the combined sequence tangible: private constraints shape which published session fits; a studio agrees exact terms; everyone sees the same frozen offer; each person approves only their share; verified required captures determine whether the booking confirms.

Avoid calling this atomic payment, escrow, guaranteed instantaneous refunds, universal merchant availability, or an autonomous booking agent. The implementation uses separate provider operations and compensation, not a single indivisible transaction. The studio catalog and participants in the current proof are fictional; money is sandbox money.

**The five evidence obligations**

| Criterion | Claim to establish | Best current proof | Work still needed |
| --- | --- | --- | --- |
| Implementation | PayPal and AI each perform a consequential part of the product. | [Six-buyer settlement](../evidence/web/hosted-six-friend-settlement.json), [duplicate delivery](../evidence/web/hosted-webhook-retransmission.json), and the [AI evaluation](../evidence/ai/evaluation-index.json). | Give these evidence paths one clear entry point and verify the final access path. Historical provider records are not a fresh health check. |
| Design | A friend and studio know what happens next, including interruption recovery. | [Booking recovery](../evidence/releases/2026-10-05-to-10/offer-recovery-next-check.json), [studio review recovery](../evidence/releases/2026-10-05-to-10/approval-recovery-next-check.json), and existing responsive checks. | Cold-review the complete core loop. Passing component checks is not proof an uncoached person understands the whole product. |
| Impact | The workflow removes an identifiable coordination burden. | The implemented planning/payment sequence and concrete examples of private requirements. | Observe a consenting group and a studio when the owner chooses to arrange it. Until then, describe the problem and intended benefit without fabricated time savings or adoption. |
| Innovation | The combined planning-to-merchant-payment workflow adds something beyond expense tracking or collecting a pool. | Private requirements, explicit collection consent, merchant-approved frozen terms, and individual capture verification. | Compare the actual workflow with the named alternatives; demonstrate the distinction instead of calling it first or unique. |
| Presentation | A reviewer can follow the input, changed plan, exact offer, and outcome. | Existing real UI and payment evidence. | Owner-controlled final packaging should foreground this sequence. No new video or submission work is part of this research task. |

**Priority 0: resolve evidence contradictions**

The saved editable Devpost project still points to the old `rally-hackathon` repository. Its description also lists the hosted six-buyer flow and genuine webhook delivery as pending, despite October 3 evidence. README has outdated test/setup counts relative to the October 10 recovery report.

Before final publication, reconcile the README, evidence index, draft description, repository URL, preview URL, and testing instructions against a single dated truth table. The canonical repository remains private until the owner's publication decision. Do not delete earlier failed evaluations or rewrite historical reports as if they were current.

Current historical facts available to that table:

| Fact | Recorded scope and date |
| --- | --- |
| Six distinct buyers, six $48 captures, $288 gross, confirmed booking | Actual hosted fictional-group PayPal sandbox proof, October 3; not live money or customer adoption. |
| Genuine provider webhook delivery and delivered duplicate handling | October 3 provider and database observations; duplicate response JSON itself was not captured. |
| 179 tests and production build passed | Final-source local verification for the booking recovery release, October 10. Not re-run on October 23. |
| Sign-in recovery preserves applicable choices | Actual React components with isolated real services, simulated faults and provider, October 10; not a hosted expiry exercise. |
| Existing hosted records preserved across that release | Read-only verified-TLS post-release audit, October 10. Not a current availability measurement. |
| Human group exercises and studio interviews | Zero recorded; agent personas and fictional tests do not change that count. |

**Priority 1: make the existing core loop legible**

A cold reviewer should understand three things without inspecting an execution log: which session can fit, what still needs agreement, and whether the group is actually booked. Payment approval, authorization, collection, confirmation, and recovery must stay distinguishable. Existing error recovery work supports this; it should not dominate the first encounter.

The completed experience is the positive outcome. Privacy and refusal behavior should appear at the moment they matter: a private limit excludes a session; another person must agree to collection; a pending payment does not become a confirmed booking. Leading only with safeguards makes the intended benefit harder to recognize.

**Priority 2: show that the AI changes a useful decision**

The existing ambiguous travel note provides a bounded example. A friend leaving Friday may be unable to attend, or may only need someone else to collect after firing. The system should make the ambiguity clear, ask once, preserve the friend's confirmed meaning, and use the resulting facts in the same planner as manual entry.

The proof is the resulting plan and consent state, not generated prose. A collector is never volunteered by the model. A spending limit is never relaxed. A suitable session must come from published studio options. Do not claim the model planned the booking or moved money; it has neither authority.

If reviewers see only a normal form and an optional text helper, they may reasonably regard AI as peripheral. The remedy is to demonstrate the requirement it resolves, then the changed feasibility of a real plan. Adding more agents without changing that value would not address the concern.

**Priority 3: make verification cheap**

Choose one clearly labeled starting path, with a visible explanation of what is interactive, what is retained historical evidence, and what would invoke a real sandbox provider. Keep a no-payment inspection path for the first encounter. Any retained result must show its date and scope; an interactive simulation must not masquerade as a new live transaction.

The present private judge access, finite workspaces, and Render Free cold wake need an availability check near judging. Do not silently widen access, recycle a financial workspace, remove identity protections, or upgrade hosting to improve a demo. Those are separate decisions. The next independent action can be a read-only access audit and a documentation correction; it need not create a new group or payment.

**A falsifiable review gate before further feature work**

Use the same published criteria for human or AI-assisted review. These are proposed internal thresholds, not official judging rules or estimates of winning odds:

1. After 15 seconds with the opening screen and description, a reviewer can name the audience, the blocked task, and the intended result.
2. After inspecting the core flow for 60 seconds, the reviewer can explain why the AI clarification mattered, why PayPal is central, and why this is more than collecting a pool.
3. Every material claim has a linked artifact or an explicit unverified label. No reviewer must reconcile contradictory buyer counts, test counts, URLs, or payment states.
4. The full presented journey fits the event's video limit and shows an actual outcome. Final recording is deferred to the owner's packaging stage.
5. A reviewer can distinguish sample execution, recorded provider proof, and a fresh live operation. If that distinction is unclear, the material fails the review regardless of visual polish.

Run this as a comprehension test, not as an invented overall score. Record misunderstandings verbatim, revise the weak explanation or interaction, and retest it. A model's favorable verdict is not evidence of customer demand or of the actual judges' decision.

The strongest objection to this plan is that clearer materials cannot rescue a workflow people do not want or a genuinely weak technical implementation. That objection is valid. Existing implementation proof supports improving evidence discovery now; real-group and merchant observation remains the separate test that could change the product direction. No outreach, model inference, new payment, deployment, repository publication, or Devpost edit was performed by this research task.
