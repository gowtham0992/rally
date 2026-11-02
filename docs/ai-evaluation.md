# AI behavior and evaluation

Rally offers an optional private-message draft alongside the form. It can propose
activity and pickup choices or ask one grounded question. The person reviews
and saves those choices; the deterministic planner, explicit consent and payment
engine remain authoritative.

## What the model receives

A request contains the consenting person's submitted message and public studio
catalog facts. Saved spending limits, availability, identities, peers' answers,
nominee choices and payment commands are not part of the interpretation contract.
Anything typed into the submitted message is part of that text.

Model inference uses Astropods. Recorded live evaluations use Claude Sonnet 4.6;
`MODEL_DEFAULT` selects the configured gateway model. The hosted application
calls a dedicated worker over HTTPS with a required bearer token. The worker
has no database or PayPal credentials. Studio contact details are excluded from
worker requests, preserving the existing protocol for contact-enabled catalogs.

## Proposals stay separate from commitments

The response schema allows technique, outcome, collection and travel meanings,
an unsupported-need result, exact source quotations and at most one question.
It cannot propose a budget, date, volunteer, reservation or financial action.

Application validation checks source revision, quoted spans, allowed values and
published offering references. A question is retained only when its answers can
change potential fit. A person must confirm that all their essentials are
represented; schema validation alone does not prove that the model understood
every need in their message.

A quoted span can be rebound to a unique source occurrence when the model's
character offsets are wrong. Straight and typographic apostrophes may also
match, but every word must remain identical and the stored quotation is restored
from the person's exact original text. Missing or ambiguous matches stay rejected.

Conditional activity wishes are not hard requirements. Explicit attendance
followed by a departure before pickup is different from inability to attend.
Genuinely ambiguous departure can require a question. Unsupported access or
materials needs remain unresolved unless the form honestly represents them or
the person completes the documented direct-studio confirmation path. No model
output verifies an unpublished studio capability.

See the [product guide](product-guide.md#handle-a-need-outside-the-form) for that
path and [payment/privacy boundaries](payments-and-privacy.md) for disclosure.

## Failure, retries and retention

Work is persisted before dispatch and scoped to the owner and source preference.
Refreshing resumes existing work rather than dispatching again. Changed sources,
expired drafts and late results cannot confirm old choices. Discard clears only
unconfirmed work after checking the latest draft ID; quota metadata remains.

Provider failure, unsupported wording and unresolved conflict have different
review states. Retry after a provider failure is explicit and quota-limited;
there are no automatic model retries. Global and actor allowances are checked
before dispatch. Failure never relaxes confirmed requirements or creates a
booking.

The inference worker logs bounded failure categories, HTTP status codes and
validation categories. It never logs submitted wording, saved choices,
credentials, raw provider responses or model output. These operator diagnostics
do not change the generic failure response or authorize an automatic retry.

Unconfirmed drafts expire after thirty minutes. Saved-note text and source
quotations follow the [private-text retention policy](private-text-retention.md).

## Recorded evaluation suites

These suites test different contracts and revisions. Their results must not be
combined into a larger current reliability rate.

| Suite | Recorded outcome | Scope |
| --- | --- | --- |
| Optional draft: conditional wishes and travel | Final 5/5 after an earlier 2/5 | Five authored fictional cases; hosted worker, October 29. |
| Earlier message draft checkpoint | Final 8/8 after an earlier 7/8 | Separate authored eight-case suite for the earlier checkpoint. |
| Saved-note clarification | Final 72/72 assessments | Twenty-four authored cases repeated three times; October 2. |

The five-case reports retain the actual proposals and failures:
[first run](../evidence/message-draft-evaluation-1793256049916.json),
[corrective run](../evidence/message-draft-evaluation-1793256757077.json).
The older draft report is
[recorded separately](../evidence/message-draft-evaluation-1793250016234.json).
The original [clarification evaluation](../public/evidence/ai/index.html) and
[machine-readable index](../evidence/ai/evaluation-index.json) retain their own
cases, dates and earlier failed runs.

The original clarification suite covers feasible wording, consequential ambiguity,
infeasible requirements, changed merchant facts, instruction/privacy attacks and
contradictions. An independently authored structured baseline and constraint
oracle check the resulting plan. Controlled database tests separately exercise
ownership, source changes, duplicate commands, consent and late responses.

Five corrected examples do not establish general language reliability. None of
these authored evaluations establishes independent human usability, demand or
merchant willingness to hold a session.

## Run an offline evaluation

```sh
npm run ai:evaluate
```

The default command evaluates authored baselines with stub transport and makes
zero provider calls. It is a deterministic check, not evidence of model quality.
[Developer setup](development.md#work-with-ai).

Live evaluation is a separate operator action using the configured provider and
credits. Inspect the relevant runner and report format, verify the account's
current allowance and authorize a bounded run before dispatch. Existing release
allowances are exhausted; a saved evaluation plan is not reusable authorization.
Each actual run must retain its failed and successful outputs, source version,
case identifiers and dispatch count. Never replace a failed report or call a
stubbed response an actual model result.
