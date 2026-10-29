# Private blockers and clear next steps

The form is now the default. Optional message drafting remains available, but a
draft cannot hide a person's own conflict behind generic advice to the group.
This implements the next slice from `uncoached-readiness-review-2026-10-28.md`.
It does not establish that independent friends can use Rally without coaching.

## What changed

- **Specific private conflicts.** A wheel requirement with a $60 limit shows
  “Wheel workshop costs $72, over your $60 spending limit” before saving and on
  the owner's next-step card afterward. Other people see only a pending step.
  Joint incompatibilities remain generic when nobody's individual choices are
  infeasible; Rally does not reveal peers' private requirements to assign blame.
- **Consistent readiness.** Saved details alone no longer trigger “Everyone's
  in.” Pickup answers, unresolved notes, personal conflicts, unfinished drafts
  and a withdrawing friend's attendance decision keep the relevant person
  pending. The plan list uses the same action resolver. Progress follows the
  group phase, rather than each person's outstanding action.
- **Pickup receipts.** Both parties see a decline acknowledgement. A person
  must explicitly choose whom to ask again. Saving changed details warns that
  an existing agreement ends. The former collector sees that it no longer
  counts; a fresh request explains that agreement is needed again. Old consent
  never authorizes the new preference revision.
- **An honest unsupported-need path.** Grounded review results quote the
  unsupported wording and carry their classification across Save, avoiding a
  redundant second AI check. Provider failures get different copy and an
  explicit, quota-limited retry. Unclassified older results remain neutral.
  An owner can record that they personally confirmed the saved note's needs
  with the studio. The immutable preference revision records who attested and
  when. This is explicitly unverified by Rally, changes no published studio
  capability, cannot change the note in the same command, and cannot override
  an existing confirmed meaning. Subsequent edits require fresh review.
- **Visible withdrawals.** The organizer and the withdrawing friend receive a
  notice on both plan and offer views. Attribution is checked against the
  immutable command fingerprint for that exact offer, never guessed from its
  closed state. After reopening, the person explicitly stays or opts out. The
  organizer cannot silently restore a person who opted out. A return needs the
  person's own command. Five people still cannot book a six-person session.
  The existing requirement that the organizer belongs to the roster remains;
  an organizer who is not joining is told a friend must start a new plan.
- **Clear offer timing.** Plan and offer cards show the share and approval
  deadline in the viewer's time zone. Stored deadlines and the studio's
  two-hour approval window are unchanged. Locked edits link directly to visible
  withdrawal controls, outside the terms accordion. Closed offers do not tell
  people they still need to approve.
- **No phantom unfinished work.** Discarding a draft clears only unconfirmed
  work for the current owner/source after checking its latest ID. A late model
  response cannot restore it, a stale window cannot delete newer work, and
  quota metadata remains. Saved preferences, consent and payment records do
  not change. A note whose confirmed meaning is unchanged does not need another
  affirmation simply because the owner edited an unrelated field.

## Verification

The local browser check used actual React components and services with isolated
PostgreSQL and controlled Auth, model and payment providers. Fictional users
completed the Sam/Taylor, decline, renewed-consent, studio, withdrawal and return
paths. Screens were checked at 375 × 812 with no horizontal overflow. No payment
approval was clicked. This is engineering verification, not a human study or a
managed-email sign-in rehearsal. See `evidence/web/blockers-browser-check.json`
and the adjacent `blockers-*-mobile.jpg` screenshots. Browser-extension warnings
are excluded from the zero application error/warning count.

The new five-case model suite uses newly authored conditional wishes, explicit
attendance/pickup messages and an unscoped departure. The first hosted run passed
2/5; its failures remain in `evidence/message-draft-evaluation-1793256049916.json`.
The corrective run passed **5/5** through private worker build `fe68b2d4`:
`evidence/message-draft-evaluation-1793256757077.json`. Exactly ten approved calls
were used, with no further calls or automatic retries. The finite schema,
grounding validator and confirmation rules were not relaxed. The older eight-case
and 72-assessment reports retain their original scopes and dates.

No database migration is required. The payment engine, financial snapshots and
provider operations are unchanged. New merchant-request checks prevent including
a withdrawn person who has not confirmed attendance. Studio-contact attestations
are private participant assertions, never merchant-verified facts. The repository
stays private; hosting stays on the existing free services and model credits.

The final release verification and hosted before/after comparison are recorded
after deployment. No additional judge workspace, Auth account, email or PayPal
operation is part of this release. Demo video and submission remain deferred.

The remaining test is with independent friends: invitation and email transitions
on actual phones, asynchronous decisions, comprehension and studio willingness.
Do not call that test completed based on fictional roles or model fixtures.
