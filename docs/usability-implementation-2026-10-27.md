# Usability changes — October 27, 2026

The owner authorized the five usability changes with the privacy, capacity and
payment corrections. Video and submission remain owner-controlled later work.

## What changed

- Friends have a generic action status. The organizer can copy a reminder with
  names and a link, without reasons, budgets, notes or pickup pairings. Nothing
  is sent automatically. Payment action statuses are organizer-only and separate
  “needs approval” from “checking”; no provider identity or decline reason leaks.
- An owner can choose and ask a pickup friend immediately after saving or
  clarifying, once both have joined. The named action explicitly shares only
  the arrangement; the nominee must agree separately. Actions precede the
  optional session preview. Declining before agreement says “I can’t do this”.
  Public studio pickup facts are shown; travel explanations and invented pickup
  timing/contact promises are not.
- Redundant detail, AI-consent, answer-confirmation and pickup checkboxes have
  become deliberate named actions, with disclosure beside them. Structured-note
  completeness confirmation, studio attestations and financial consent remain.
  Pickup has no preselected answer; choosing “not sure” explains that planning
  cannot finish. Notes are neutral and open, with no seeded example.
- The organizer can update planning membership before issuing an offer. Seven
  may become six; five still needs a replacement for this studio. A pending
  studio review is invalidated. A roster edit racing studio approval has one
  winner. Reopening a recovered offer can return to roster review; current
  offers, old snapshots and payment history cannot be rewritten.
- Removed friends see a notice and retain authorized links to their earlier
  payment records. Pickup arrangements involving either removed person are
  explicitly invalidated and their disclosed partner sees the withdrawal.
  Re-adding someone cannot revive their old agreement.
- Payment language distinguishes a hold, a charge, a verified booking, release
  and refund. Separate payments can partially succeed; completed charges then
  need refunds. No immediate-release or all-or-nothing payment promise is made.

## Earlier Free email sign-in decision

The owner explicitly chose to retain Free magic-link sign-in. Supabase rejected
both template update attempts: its Free built-in provider does not permit email
configuration changes needed to show the OTP. Both requests returned HTTP 400.
No email was sent, SMTP configured, account created, card added or plan upgraded.
The attempted code fallback is not in the runtime or UI. The original PKCE,
managed identity, HttpOnly cookies, exact-Origin checks and quotas remain.
The login page now explains opening chat invitations in the intended browser
before requesting the email link. The built-in sender also delivers only to project-team email addresses, per
[Supabase’s SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).
This earlier sender decision was superseded by the owner-approved
[Resend Free SMTP setup](free-smtp-2026-10-27.md). Actual
multi-device/browser delivery remains a rehearsal gate; instructions do not
resolve or verify it.

Migration 015 was already applied before the provider restriction was known.
Its two unused email-verification quota scope names remain reserved, with no
runtime handler or policy using them. The finite constraint adds no access.
The applied migration is retained verbatim rather than rewriting history.

## Verification scope

Actual React components and real planning/booking services were exercised with
fictional preauthenticated actors in disposable PostgreSQL. Model and payment
responses were controlled. This is integration verification, not a human study
or managed email-delivery rehearsal. The real PayPal adapter/engine was not
changed and no new external model or PayPal operation was initiated.

The flow covered note confirmation, same-visit pickup request before roster
closure, decline, fresh request to another friend, nominee agreement, named
reminder, an initially unanswered pickup field, a deliberate saved choice,
seven-to-six membership, a five-person minimum block, re-addition, and a matching
six-person studio session. Sensitive-input DOM redaction prevented one direct
code-value assertion during the now-deferred code experiment; it was not used
as a successful verification claim.

Backend regressions cover scoped nomination, disclosure, admission, private
note expiry without renewal, minimum capacity, immutable old offers/payments,
recovered-round membership changes and the studio-approval race. Existing
payment/privacy tests and mutation checks remain authoritative.

## Rollout and recovery

Migration 015 adds `planning_members.excluded=false` and the finite
`ROSTER_INVALIDATED` audit action. Existing rows, offers and approvals retain
meaning; all browser grants remain unchanged. Protected hosted history is
fingerprinted before and after rollout. No judge workspace is consumed by
release checks.

After anyone uses roster exclusion or early pickup, retain this release’s
exclusion-aware backend and schema when repairing or reverting UI. Do not deploy
an older backend that ignores excluded members or requires admitted collectors.
Use a compatible forward fix and preserve all financial recovery processing.

## Still requires real people

The corrected [study plan](uncoached-study-2026-10-27.md) separates comprehension,
uncoached completion, preference and infrastructure. No adoption or usability
success is inferred from these automated/controlled checks. The video, Devpost
page and repository visibility are unchanged by this work.

## Released verification

Runtime commit `0073eab` is live on the existing Render Free service, deploy
`dep-dbgn8puc6qcc73c5djc0`, completed in 79 seconds. Final source passed
**194 tests**, all **62 existing deliberate guard mutations**, typecheck and
production build. The staged source scan found no secrets. Responsive checks
covered 375px, 768px and the desktop layout; application console warnings/errors
were zero, excluding browser extensions.

Twenty-four hosted checks passed, including ready health, public pages, the
original twelve recorded screenshot hashes and reports, anonymous denial of
planning commands and the absence of the deferred email-code endpoint. No
judge workspace was claimed. All original financial, offer, preference, consent
and original workspace/group fingerprints matched the before-release snapshot.
Ten untouched judge workspaces remain; no existing membership was excluded.

[Hosted release report](../evidence/web/usability-release-2026-10-27.json).
