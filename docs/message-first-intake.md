# Message-first private choices

> Historical record. This document describes its original checkpoint or proposed
> study, not current product instructions. Start with the [documentation](README.md)
> or [development history](history.md) for context.

The first-screen design below is historical. The form is now the default and
message drafting is optional. Current blocker handling, model checks and limits
are documented in [the readiness implementation](uncoached-blockers-implementation.md).

“Say it once” drafts editable activity and pickup choices from a person's own
message. Dates and spending limits remain explicit form inputs. Nothing becomes
a saved requirement until the person reviews and saves it.

The first screen offers an empty message field and a manual alternative. A clear
message fills supported choices and shows its exact evidence beside them. An
ambiguous message asks at most one question. Unsupported needs and contradictory
requirements remain unresolved; the form never silently drops them. Naming a
friend does not nominate them or grant their agreement.

## Privacy and payment boundaries

Pressing Draft explicitly sends that message and public studio facts to
Astropods. Saved budget/date selections and other people's details are excluded.
The owner must confirm the resulting choices. Pickup disclosure and agreement
remain separate commands. The model has no booking or payment authority.

Drafts live in a separate private table with owner-scoped application access,
row-level security and a fixed 30-minute text/result lifetime. The existing
database retention job redacts expired contents. Metadata remains for quotas.
Refreshing resumes existing work without another model dispatch. A changed
saved preference, expired draft or late response cannot approve old choices.

Both interpretation paths share the existing global request quota and the
participant's daily allowance. There are no automatic model retries.

## Verification at the current checkpoint

- 217 local tests pass. Typechecking and the production build pass. All 62
  existing privacy, consent and payment guard mutations were caught.
- Controlled-provider browser checks cover clear two-field drafts, a single
  travel question, refresh/resume, preservation of existing budget/date inputs,
  explicit saving and unsupported-need fallback. These are fictional local
  checks, not human usability results.
- Migration 016 is applied to the hosted private schema. A read-only fingerprint
  comparison confirms the pre-existing preferences, consents, offers, payment
  history and original workspaces are unchanged. Ten untouched workspaces remain.
- The first connected eight-case model run passed 5/8. After a draft-specific
  prompt correction, the three approved targeted rechecks passed 2/3. Named-friend
  pickup and same-day pickup passed; ambiguous travel failed validation and
  returned review. These reports are preserved separately under `evidence/`.
- Under the final 16-call approval, the first eight checks passed 7/8. The actual
  travel response contained the correct question but an empty evidence array;
  strict validation rejected it. The draft prompt now explicitly requires quoted
  ambiguous evidence alongside a question. The validator was not relaxed.
- The final eight checks passed **8/8 through the actual hosted worker**, build
  `6b867042`, using managed production gateway credentials. Travel offered the
  two correct alternatives in one question; supported choices remained
  drafts and unsupported needs safely required review. See
  `evidence/message-draft-evaluation-1793250016234.json`. All 16 approved calls
  were used; there are no further calls or automatic retries under that approval.

No human-group usability claim follows from these checks. Demo video and
submission preparation remain deferred.

## Production credential migration

The copied Astropods development gateway key expires after one day and must not
be used as a production credential. The prepared AI-only worker receives the
platform-managed gateway configuration. Render retains all database, consent,
quota and payment operations and calls the worker through a dedicated bearer
service token. The worker accepts only the closed interpretation input, checks
the token before dispatch and fails closed. Its image contains no database or
PayPal client and no environment files.

Build the worker from the repository root with
`node --import tsx scripts/build-ai-worker.ts`. The Docker context is confined
to `deploy/ai-worker`; the blueprint must be private. The owner approved one
first-agent free-compute deployment, with no card or paid plan and a stop if
compute is shown above $0. Final model acceptance passes. Private blueprint
build `6b867042` runs
as deployment `bg4-h5i-dok`. After explicit owner approval, its Public transport
allows Render machine access while the worker's bearer check remains mandatory
before inference. The deployment form labels first-agent compute free; no card
or paid plan was added. The proxy timeout is 30 seconds.

Live boundary checks return health 200, anonymous inference 403 and authenticated
invalid input 400, with zero model calls. See
`evidence/message-ai-worker-boundaries.json`. The URL and dedicated token are
saved privately in Render. App commit `30a78a4` is live on the existing Free
service as deployment `dep-dbhd66qfngtc73bbf720`. Nine public readiness and
anonymous/foreign-origin denial checks pass; protected hosted history is
unchanged. See `evidence/message-release-verification.json`. Never substitute a
temporary development key to finish a release.
