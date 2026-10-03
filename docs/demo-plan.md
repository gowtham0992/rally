# Rally demo plan

Rally's demo should make one promise memorable: **six friends, one booking,
nobody fronts the whole bill.** Show a complete pottery booking that respects
each friend's private requirements, then show what Rally does when a payment
cannot complete. This is the recording plan, not a claim that the complete
browser journey or video already exists.

The audience is a friend organizing a private pottery session and the studio
selling that session. The working hypothesis is that clarifying a small but
consequential ambiguity, preserving private budgets and coordinating separate
payments makes this booking easier. Actual group usability and merchant
validation remain unproven. A convincing demonstration cannot replace them.

## Finish one loop

The core journey stays: private requirements, a useful clarification when
needed, explicit collection consent, a fixed offer approved by the studio,
individual sandbox payments and truthful booking/recovery status. Maintain the
published six-to-eight-person capacity. Six distinct Personal sandbox accounts
are now visible in PayPal Developer; their independent checkout approvals and
payer identities still need verification.

Adopt existing Supabase Auth, PayPal sandbox, Astropods inference and Render
hosting. Build the coordination, privacy and recovery behavior that makes this
specific journey useful. Finish isolated judge entry so another person can
actually try it without sharing another judge's group.

Defer AWS migration, additional activity categories, general travel planning,
automatic group-chat ingestion, extra sponsor integrations, social feeds,
analytics dashboards and new pricing schemes. None is needed to demonstrate
this booking. Preserve required payment, ownership and privacy checks; smaller
scope does not justify hiding an uncertain payment or skipping consent.

The weakest presentation is a list of features followed by a long explanation
of the backend. The strongest objection to the product is that another approval
flow may burden friends who already agree. Demonstrate the case where it helps:
one friend has a private ceiling and another may miss collection after firing.
Do not claim that every group needs Rally or that the concept is unprecedented.

## Draft a 155 second video

| Time | Actual screen to record | Draft narration |
| --- | --- | --- |
| 0–10 | Phone view of Rally and its group. Establish the sandbox/fictional-studio label. | “Six friends want to do pottery. Someone has a budget they would rather keep private. Someone is leaving town. And nobody wants to pay for everyone. This is Rally.” |
| 10–30 | Alex saves a $50 private ceiling, the published Thursday slot and the requirement to form a cup. Show the organizer's roster separately. | “Each friend adds what works for them. Alex can spend fifty dollars and wants to make a cup. Their spending limit stays private; the group sees who is ready.” |
| 30–60 | Sam enters “I leave Friday.” Record actual inference, the clarification, Sam's confirmed meaning, explicit nomination of Jordan, Alex closing the six-person roster, then Sam's disclosure and Jordan's separate agreement. | “Sam writes, ‘I leave Friday.’ Does that prevent attending, or collecting the fired piece later? Rally asks. Sam confirms that collection is the issue, chooses Jordan, and Jordan separately agrees. The AI cannot volunteer a friend or approve on their behalf.” |
| 60–75 | Show the validated $48 hand-building candidate and Alex's selection. | “The published hand-building session fits the group's confirmed requirements at forty-eight dollars each. Rally uses the studio's prices and facts. It does not invent a cheaper workshop or reveal anyone's budget.” |
| 75–95 | Switch to the distinct studio operator. Record the actual review and reservation approval. | “The studio reviews the exact group and collection arrangement, blocks its session and opens a two-hour booking window. This is a studio commitment, not an AI guess about availability.” |
| 95–125 | Show actual PayPal sandbox approval and Rally's waiting state. Use labeled time cuts through the remaining independent approvals; then show the verified confirmed booking. | “Everyone reviews the same offer and approves their own share in PayPal sandbox. Rally waits for all six independent approvals and verifies every capture before confirming the booking. No friend pays the full bill.” |
| 125–145 | Clearly separate a recovery run. Use the existing three-buyer actual sandbox evidence until a corresponding product-browser recovery recording is proved. | “Here is a separate three-buyer sandbox recovery test. We deliberately canceled one authorization after the first capture. Rally did not confirm the booking: the completed payment was refunded and the remaining authorizations were voided. Unknown results stay unresolved until checked.” |
| 145–155 | Return to the finished product. Show the working custom-domain URL only after verification. | “A plan that fits everyone. Everyone pays their own share. Try Rally.” |

This 248-word draft leaves time for readable actions and pauses.
Use original narration and authorized assets. The recorded cut must be timed; a word-count estimate is not a finished video.
If the sequence feels rushed, cut explanatory narration and repeated clicks
before removing the private-budget, consent or financial-outcome evidence.

## Record only what happened

Use a visible, restrained “Demo studio · PayPal sandbox” label. The six friends
and studio are fictional test identities. Prepared selections must be described
as prepared demo data, not customer activity or consent. Role switching must
identify whose account is acting. Show each consent and payment approval that
the story relies on; do not animate or seed a successful outcome.

Screens must come from real app interaction. Cuts may skip elapsed time and
repetitive approvals, but must preserve order and identify separate runs. Do
not combine different offers into one apparent successful booking. Match the
shown confirmation to its captured amounts, six distinct payer IDs and seller.
When reusing the existing recovery report, retain its explicit three-buyer
scope and fault label. Do not present it as the six-person browser recording.

The AI evidence is 24 authored synthetic cases repeated three times, with
72/72 quality assessments passing in the final run and earlier failures
retained. That supports this tested clarification/planning boundary. It does
not establish real-world success rates, adoption, conversion or user savings.
Link the full evidence from the repository; a legible product journey takes
priority over displaying a wall of test counts in the video.

## Recording and release gates

- [ ] Finish managed judge account provisioning, separate cookies, clear role identity and stale-tab protection.
- [ ] Prove six distinct managed participants and an independent studio operator through the actual browser journey.
- [x] Observe six distinct Personal sandbox accounts for the unchanged six-person offer. The three CLI buyer IDs stay separate; actual independent checkout approval remains pending.
- [ ] Record actual clarification and both collection agreements without exposing peer budgets or private credentials.
- [ ] Prove all six captures and confirmation for the same fresh offer; prove browser recovery separately and retain the existing sandbox evidence.
- [ ] Deploy within verified credit coverage and verify the custom domain, HTTPS, login and checkout returns.
- [ ] Produce a first rough recording as soon as that journey works, then refine pace, legibility, audio and the opening. Keep packaging active throughout the remaining build.
- [ ] Audit the final recording and written claims against their exact evidence. Preserve unresolved outcomes and distinguish synthetic/sandbox evidence from observed human feedback.

The recording passes only if a viewer can identify the user, the problem, the
useful AI action, the independent payments and the booking result without an
engineering explanation. As a proposed internal clarity check, ask three
authorized reviewers to explain those five points after one viewing; aim for
all three to do so. This is a proposed check, not completed feedback. Obtain
the user's authorization before contacting anyone.

## Current event requirements

Checked through the official Devpost connector on October 2, 2026. The
submission window ends November 12, 2026 at noon Pacific (20:00 UTC). The five
criteria are Technological Implementation, Design, Potential Impact,
Innovation/Idea and Presentation. The event asks for meaningful PayPal sandbox
and AI use, a functioning demo judges can run, documented source in a public
open-source GitHub repository, and a publicly visible YouTube demo under three
minutes. A hosted demo is one way to provide runnable access; complete setup
instructions are another. Our goal still includes hosting.

The participant's advice about packaging is useful strategic guidance, not an
official weighting or a verified prediction of winning odds. This planning
check does not complete the formal rules/eligibility audit, publish the
repository or video, or prepare every official form answer.

Sources: [official event and judging criteria](https://paypalaihackathon.devpost.com/),
[current source snapshot](../evidence/hackathon-packaging-preflight.json),
[actual participant clarification](../evidence/ai/participant-flow.json),
[actual PayPal sandbox runs](../evidence/paypal-sandbox/index.html),
[current build evidence and remaining gates](../progress.json).
