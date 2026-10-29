# Message-first private choices

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
- The latest exact-ID prompt correction has not yet received live acceptance
  testing. A fresh complete matrix is required before claiming an 8/8 result.

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
compute is shown above $0. Deployment and final model acceptance are still
pending at this checkpoint. Private blueprint build `09c5ae9e` is uploaded and
its deployment inputs pass the CLI dry run. Automatic approval review blocked
the platform's Public transport setting; explicit approval for that setting is
pending. The worker's bearer check remains mandatory before inference. Keep the running Render release until both gates
pass; never substitute a temporary development key to finish a release.
