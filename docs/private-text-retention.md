# Private note expiry

Rally deletes raw private notes and model quotations 30 days after a planning
round ends. Confirmed structured choices, collection agreements, offer terms,
payment history and command identities remain unchanged. This implements the
retention requirement in `build-contract.json`; it does not claim to delete
copies held by an external model provider or provider-managed backups.

Planning ends when the studio issues the offer (`OFFER_ISSUED`) or the round is
abandoned. Closing the roster and requesting studio review still allow editing
and clarification, so those actions do not start expiry. Every preference
revision receives its own database timestamp. Reopening a round cannot extend
an existing deadline; newly saved preferences receive a deadline when their
round ends. The owner can configure 1–365 days before future rounds close.
Policy changes do not reset stored deadlines.

## Copies and preserved records

- `preference_revisions.optional_text`: cleared across every expired revision,
  including historical copies produced by clarification and preference edits.
- `planning_clarifications.result`: cleared for every expired source revision,
  including its exact `sourceSpan` quotations. Active requests become stale;
  answered/declined status and references remain.
- `wording_bound`: only confirmed typed facts, never raw wording; preserved.
- `intake_commands`: result IDs, revision numbers, invite token, or booleans;
  request bodies are represented by a fingerprint, not persisted raw payloads.
- Planning and payment events carry metadata, not private notes. Cleanup adds
  `PRIVATE_TEXT_REDACTED` without changing the planning revision or source hash.

Owner projections stop returning expired wording immediately, even before the
next maintenance tick. AI dispatch and response commits check the same deadline.
Database triggers reject restoring quotations or redacted notes and prevent
extending/resetting an existing expiry. A draft deliberately submitted by its
owner is a new preference; the server never automatically revives old wording.

## Bounded cleanup

`purge_expired_private_text(integer)` processes at most 100 revisions by default,
at most 25 groups per call, with a supported bound of 1–1,000 revisions. It locks
groups before their preferences, skips busy rows and is safe to repeat. Its
fixed elevated search path places `pg_temp` last to prevent temporary tables
from shadowing private relations. Browsers cannot execute it; the runtime can
request bounded cleanup but cannot change the policy.

Local workers and active settlement invocations run cleanup. Hosted cleanup also
has its own native PostgreSQL Cron job because the payment scheduler sends no
HTTP request when no payment work exists. This job makes no HTTP, model, PayPal
or email request and creates no paid service or artificial Render keepalive.

After applying migration 012 with the existing owner provisioning procedure,
install the job using the ignored mode-600 provisioning configuration:

```sh
ENABLE_HOSTED_PRIVATE_TEXT_RETENTION=true RALLY_PRIVATE_TEXT_RETENTION_DAYS=30 \
  node --env-file=.env.provision --import tsx scripts/configure-private-text-retention.ts
```

The command checks the expected healthy project and database permissions. It
updates the single named `rally-private-text-retention` job to run every minute.
A successful Cron receipt proves invocation; actual removal must be verified
separately against expired rows. Busy groups and a large backlog may require
additional ticks. Monitor due-row counts and failed Cron receipts without
logging raw text.

## Migration and rollback

Before hosted application, inspect row counts and due dates without returning
raw notes. Backfill uses the earliest durable offer/abandonment event on or after
each preference's creation. Legacy abandoned rounds lacking a dated event begin
their countdown at migration time. Old note creation alone is never interpreted
as planning closure. The small sandbox dataset uses a transactional backfill;
larger datasets require a separately planned batched migration.

Runtime rollback retains the additive schema and cleanup job. Previously
deleted wording cannot be recovered. The down migration is only for disposable
empty schemas and refuses populated preference/planning history or an active
cleanup job. Never run it as a hosted rollback.

Twelve isolated PostgreSQL tests cover closure semantics, legacy backfill,
recent/open preservation, completed simulated payments, source hashes, bounded
concurrent cleanup, immutable deadlines, owner reads, model races, meaning
preservation, temporary-table isolation and empty up/down/up.

Native SQL scheduling follows the [Supabase Cron documentation](https://supabase.com/docs/guides/cron/quickstart).

The October 3 hosted sandbox verification observed one native cleanup job remove
a deliberately aged fictional note and quotation, with no app cleanup call.
Existing financial, consent and command digests stayed unchanged. Runtime
`43215f7` passed forward deployment, rollback to `6696eef` and restoration while
retaining the privacy schema/job. A separate restricted-role closure probe
assigned the thirty-day deadline and rolled back every test row. The expired
owner screen and subsequent budget edit were observed on the local production
build at 374 CSS pixels with no horizontal overflow.
