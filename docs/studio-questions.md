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
5. The studio sees the question only when it next opens Rally; no notification
   is sent. Return to your plan to read its exact reply. The studio answers in
   its Guest questions section.
6. If the studio confirms it can accommodate the need, read every condition.
   Continue only after confirming the reply covers every essential need in your
   saved note for that exact session.

The studio can confirm the need for the exact session or say it cannot confirm
it, with an explanation. A negative answer leaves the need unresolved. New
replies do not offer “Needs discussion”: Rally has no in-app follow-up thread.
Older discussion replies stay readable and unresolved. To ask a fresh question,
review and save your details first; this creates a new preference revision.
No earlier answer or consent is silently reused. Rally
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

If that exact session no longer fits the group, only the owner sees a notice
identifying the session their answer covers. The answer is never widened to a
different session, and nobody else’s choices are disclosed. Review your own
details before asking about another session; your needs remain in force.

## Optional AI help

The hosted preview enables optional AI question drafting. The manual exchange
remains available when the studio is configured. AI help selects a literal need from your saved note and puts a question in an
editable box. It does not send the question or resolve the need. You separately
review and consent before sharing with the studio.

The initial six checks all ended in review. A diagnostic reproduced a valid
JSON answer inside a code fence, which the new parser incorrectly rejected.
The parser now accepts a complete JSON transport fence while rejecting prose,
extra fields and invented evidence. The prompt also distinguishes quoting a
guest's access/materials request from promising a studio capability. The
[corrective check](../evidence/studio-question-evaluation-1793761616523.json)
passed the six authored cases, including explicit review of unrelated and hostile
messages. This is not a general model reliability rate or independent usability
study. Earlier failed checks remain recorded.

Question drafting is off by default in a fresh installation. Set
`RALLY_STUDIO_QUESTION_AI_ENABLED=true` only after deploying the compatible worker
and verifying the guarded request path. The service rejects draft requests before
reserving model quota when disabled. This setting does not affect Rally's existing
activity/pickup AI helper.

The implemented, gated path explicitly sends a saved note to Astropods AI.
The entire note and public studio facts are sent; saved spending-limit and
availability fields, the roster and studio contact details are excluded. A
spending limit or name typed into the note is still sent with that note.

AI selects a literal quoted requirement. The application checks its evidence,
rejects known roster-name references, obvious contact details and financial wording, and
places a question in an editable text box. This is not a guarantee of anonymity
or correct interpretation. Ordinary grammatical uses of “will”, “may” and “can”
are allowed in recognized question or sentence patterns, even when a friend has
that name; actual name references remain blocked. This is not a blanket name
exception. Review every word before consenting to send it.

An unavailable service or invalid response is labelled “AI drafting is
unavailable”. An explicit model review result instead asks you to write the
question yourself. Both preserve the note and any typed question. An interrupted
request stops appearing as pending after 45 seconds when checked again, without
starting another model call. The same request cannot be silently retried.

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

A question or answer can expire before the note itself. Rally shows an explicit
expiry notice and requires fresh saved details and a new studio review; an old
acceptance cannot make the friend ready. Database expiry is authoritative even
if a retained acceptance marker has a later timestamp. This affects planning;
issued offers retain their existing payment and recovery actions.

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

The [dated deployment receipt](../evidence/studio-question-deployment-2026-11-03.json)
records the enabled preview, one real deployed-worker inference and the scope of
production checks. It does not establish a hosted authenticated group walkthrough
or independent usability.

The worker adds a `QUESTION` purpose behind the existing bearer-token check.
Release the compatible worker before enabling the new optional drafting path in
the web application. The manual relay needs no worker deployment. An older or
unavailable worker fails closed to manual entry. `/health` reports
`questionDraftVersion: 2` when the worker supports distinct unavailable/review
results in the question contract; health
alone does not establish actual model availability.

`test/studio-questions.test.ts` exercises the relay, privacy boundaries,
session binding, explicit acceptance, retries, staleness, quotas and retention
against PostgreSQL with simulated AI. `test/studio-question-ai.test.ts` checks
the worker and gateway contracts with controlled responses. These checks do not
establish actual model quality, independent usability or studio participation.
