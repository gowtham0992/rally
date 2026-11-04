# Ask the studio about an essential need

If a saved note includes a need the form cannot represent, you can ask the
configured studio inside Rally. This works without a published email address.
The studio must have a published catalog and an operator account in Rally.

1. Save your details, keeping the need in your private note.
2. Open the studio-question section in your note review. Choose a published
   session that fits your form choices.
3. Write a question. Your name, original note and private form answers are not
   attached. Remove names, contact details, spending limits and unrelated needs
   from the question itself. Free text can still identify you; review it carefully.
4. Explicitly agree to share that exact question and session with the studio.
5. Return to your plan to read the studio's exact reply. Rally sends no email
   notification. The studio answers in its Guest questions section.
6. If the studio confirms it can accommodate the need, read every condition.
   Continue only after confirming the reply covers every essential need in your
   saved note for that exact session.

A negative answer or a request for discussion leaves the need unresolved. Rally
does not classify a conditional reply as a simple yes or verify access, medical
safety, materials or other studio capabilities. The studio supplies its answer;
the friend decides whether it covers their needs.

## What acceptance changes

Accepting saves a new preference revision. A previous pickup agreement needs
fresh agreement. The planner can use the studio answer only for its exact
catalog version, offering and time. Editing saved details invalidates the
arrangement. The studio sees accepted question-and-reply pairs during its normal
session review and must still complete all four booking confirmations.

The exchange does not reserve a session, create an offer, approve a hold or move
money. Existing PayPal approvals and payment verification remain separate.
Other friends and the organizer do not receive the exchange or its reason.

## Question-draft implementation and release status

The manual exchange is the available path. The optional question-draft helper
is **disabled by default**. In its first six actual model checks, all six calls
returned review; none of the three straightforward needs produced a usable
question. The three safety cases abstained. This is not evidence that the helper
is useful or ready to enable. [Recorded cases](../evidence/studio-question-evaluation-1793758872372.json).

Do not set `RALLY_STUDIO_QUESTION_AI_ENABLED=true` until fresh, explicitly approved
checks establish useful behavior without weakening privacy or grounding guards.
The service rejects draft requests before reserving quota when disabled. This
setting does not affect Rally's existing activity/pickup AI helper.

The implemented, gated path explicitly sends a saved note to Astropods AI.
The entire note and public studio facts are sent; saved spending-limit and
availability fields, the roster and studio contact details are excluded. A
spending limit or name typed into the note is still sent with that note.

AI selects a literal quoted requirement. The application checks its evidence,
rejects known roster names, obvious contact details and financial wording, and
places a question in an editable text box. This is not a guarantee of anonymity
or correct interpretation. Review every word before consenting to send it.

Model failure leaves the manual question available. No model interprets the
studio's reply. Drafts share the existing member, daily and global AI limits,
have no automatic retries and expire after 30 minutes. Draft inference is
limited to 600 output tokens per call.

## Privacy and retention

Only the question's owner and configured studio operator can read the exchange.
Access is scoped to the normal account or isolated judge workspace. Questions
and replies expire after at most 30 days, or earlier if the source note already
has an earlier retention deadline. Expired wording is hidden immediately and
removed by the existing bounded cleanup job. Quota and consent metadata remain;
payment records and immutable booking terms are not changed by cleanup.

## Implementation and verification

Migration `017_studio_questions` adds the backend-only exchange and draft tables.
Run it before the new application code. Old application code can run against
the expanded schema **before any answer is accepted**. Once friends accept
session-bound answers, do not restore an older planner that ignores those
restrictions. Keep the new guards and fix forward.

To pause new questions, set `RALLY_STUDIO_QUESTIONS_ENABLED=false` and redeploy.
This hides new-question entry and rejects new asks and drafts; owners and studios
can still finish existing exchanges, and accepted session restrictions remain
in force. This pause path is tested locally. The down migration refuses to remove
populated history. Do not use it as a production rollback.

The worker adds a `QUESTION` purpose behind the existing bearer-token check.
Release the compatible worker before enabling the new optional drafting path in
the web application. The manual relay needs no worker deployment. An older or
unavailable worker fails closed to manual entry; keep question drafting disabled.

`test/studio-questions.test.ts` exercises the relay, privacy boundaries,
session binding, explicit acceptance, retries, staleness, quotas and retention
against PostgreSQL with simulated AI. `test/studio-question-ai.test.ts` checks
the worker and gateway contracts with controlled responses. These checks do not
establish actual model quality, independent usability or studio participation.
