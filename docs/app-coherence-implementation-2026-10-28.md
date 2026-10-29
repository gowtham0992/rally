# One plan, one next step

Rally now puts the viewer’s immediate action above the people list and saved
details. The plan and booking share a layout, title and five-stage progress
strip. Waiting screens can have no primary button; a closed session never
highlights an active approval step.

## Changes from the coherence review

- A shared, pure next-step resolver serves the plan screen and plans index.
  Removed membership and issued booking/payment states outrank old planning
  blockers. Personal pickup requests outrank organizer actions. A collector
  sees the requester’s name only after the existing disclosure boundary permits
  that request. Raw preferences and request records stay out of the index.
- Completed details, personal fit, studio options, terms and historical records
  sit below the current action in collapsible sections. Editing preserves the
  existing validation, draft handling, stale-revision checks and sign-in pause.
  The member editor stays under People and is disabled during detail editing.
- The plan and offer use `PlanShell`. The prominent details counter is gone.
  People show plain statuses, with individual payment statuses still restricted
  to the organizer. The person’s actual payment status still comes from the
  unchanged payment engine and checkout component.
- Creating a plan asks only for a name. The initial capacity is the catalog’s
  smallest supported size; closing freezes the actual supported headcount.
  Six, seven and eight are accepted for this studio; five is rejected server-side.
  Existing clients that supply a size remain supported. A single fitting session
  reaches studio review in two actions: confirm everyone, then ask the studio.
- The offer has one organizer reminder containing its link and deadline. The
  invitation remains available under People when it is not the current action.
- Invitation entry leads with the inviter and a join button, with the catalog
  collapsed below. Sign-in and the authenticated join form name the plan. The
  new same-origin, bounded preview accepts the existing secret invite capability
  in a POST body and returns only the organizer’s display name and studio name.
  It never admits a member or returns the group’s state, people or preferences.
  Invalid, closed and managed-demo invitations reveal no preview identity.
- Studio waiting screens identify the requested activity, date and public price
  from the frozen catalog. An edit invalidates that context. The collector’s
  confirmed booking repeats their own pickup duty; it is not inferred from a
  private note or shown as another friend’s private next step.

## Protections and limits

The payment engine, checkout consent, studio review page, four studio
attestations, SMTP settings and Auth code exchange are unchanged. Exact session,
price, pickup and cancellation facts remain visible when approving a payment.
Recovery remains explicit, with separate refunds/releases and no atomic-payment
promise. Old booking URLs and snapshots remain historical records.

No migration, paid service, email, external model call, PayPal operation, new
hosted identity or judge lease is required by this release. Managed demo previews
are deliberately excluded from the new unauthenticated invitation preview.
Magic links retain their same-browser requirement. Email codes, notifications,
last-seen storage, changes to the approval window and a different planning model
remain outside this implementation pending the rehearsals described in the review.

## Verification

The final suite passed **204 tests**. All **62 existing guard mutations** were
caught; the moved private-feedback guard now targets its shared source file.
Type checking and the production build passed. The state matrix checks seventeen
scenarios across four roles, separately from browser verification.

Actual React StrictMode components were exercised with real planning, booking
and payment services in a disposable local PostgreSQL schema. Auth identities,
model responses and payment provider responses were controlled. Checks covered
note confirmation, inline pickup request, separate collector agreement, a
seven-to-six dropout, the two-action studio request, all four studio attestations,
unchecked payment consent, invitation-first entry, contextual login, name-only
creation, booked pickup duty and completed cancellation recovery. No external
provider was contacted by these checks.

Phone width 375, tablet width 768 and desktop were inspected. The exact
375×812 and 768×812 recovery views were checked; the saved pickup/invitation
screenshots use the earlier 375×755 viewport. Application console errors and
warnings were absent in the final recovery check; six MetaMask extension warnings
and the React development-tools information message were excluded. The primary
accent’s text contrast is 13.38:1; the existing tokens are unchanged.

An earlier regression run collided with concurrent disposable-schema teardown
and hit a database catalog deadlock. The unchanged suite was rerun without
concurrent teardown and passed. This was not used as a successful check.

These are engineering checks, not evidence of human usability. Zero independent
friend groups and zero studios have been observed. The phone/chat-app sign-in
rehearsal and independent studies remain open. Video, submission and repository
publication remain deferred.

## Release and recovery

The release uses the existing Render Free service and private repository. Source
secret scans passed. Read-only hosted-history fingerprints match before and after
release; ten untouched judge workspaces remain. No schema or service configuration
changed. The [hosted release report](../evidence/web/coherence-release-2026-10-28.json)
records the final artifact and public checks.

Render’s install step exposed dependency advisories. A separate follow-up pinned
Next.js 16.4.3 and Zod 4.6.7. The full 204-test suite, all 62 guard checks, type
checking and build passed on the patched dependencies; the production audit is
clean. A final live-browser check caught the authenticated malformed-invite case.
That guard reuses the tested capability parser; its ten focused coherence tests,
type checking and build passed again. No new full-suite or guard run was needed
for the two-line client preflight.

The older `0073eab` artifact is a historical recovery reference. Automatic approval
review rejected a live rollback rehearsal because it lacked specific production
reversal authorization. The owner explicitly chose to skip that rehearsal and
keep the patched release. No rollback was executed. Preserve patched dependencies
and financial recovery processing in any subsequent UI repair or restoration.


Final runtime commit `6fbf33b` is live, Render deploy `dep-dbhb1o88v5cc73fvmtag`,
completed in 78 seconds on Node 22.22.0 and Next.js 16.4.3. Twenty-nine public
HTTPS/content/denial checks passed, including all twelve original screenshot
hashes. The signed-in live browser check confirms malformed links show the
unavailable state without a join form or group identity. All protected hosted
fingerprints still match and ten untouched judge workspaces remain. The local
fictional schema and its dedicated test container were disposed.
