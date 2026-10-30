# Consent, opt-out and closed-offer corrections

This is the bounded correction pass following Fable's October 29 review. It
adds no AI feature, notification system, payment operation or submission work.

## Changes

- **Opt-out persists across rounds.** The latest attendance decision by each
  authenticated member is scoped to that group and its originating offer,
  ordered by database revision. A later expired offer cannot erase a refusal.
  Roster updates and merchant requests/approvals reject an opted-out member.
  Only that member can reverse the choice when planning is open. The previous
  offer's payment approvals never transfer.
- **Studio contact is a prerequisite, not an invented fact.** An optional
  published catalog email provides the direct contact route. Recording a
  confirmation requires fresh, explicit consent to a generic studio notice.
  The studio sees that a guest reports direct arrangements, without the guest's
  identity, need, quotation or note attached to the notice; its existing facts
  confirmation includes those arrangements. This remains a participant assertion,
  not a verified capability. With no published contact, the button is absent
  and the need stays unresolved. The hosted fictional catalog currently has no
  contact; no fake address was added. Older attestations are preserved but cannot
  authorize new disclosure or satisfy subsequent planning without fresh review.
- **Closed offers reflect personal payment evidence.** A person with no payment
  operations sees a short explanation and “You weren't charged.” A withdrawal's
  existence is visible, but the withdrawing friend's name remains scoped to that
  person and the organizer. Any payment operation, including a planned or
  uncertain one, retains the full payment/recovery view. The plan list uses the
  same distinction. Reopening still requires completed recovery and explicit
  organizer confirmation.
- **Pickup visibility matches consent.** Unrelated friends, including an
  uninvolved organizer, no longer receive the arrangement in the offer API's
  snapshot projection. Owner, nominee and studio retain access. The complete
  immutable server snapshot and its financial hash are unchanged.
- **Refund language describes initiation and verification.** Timing, withdrawal,
  cancellation and checkout explanations say that Rally starts refunds and
  releases holds; results remain unresolved until PayPal confirms them. The
  settlement and compensation state machines are unchanged. The only payment
  engine change is a read-only indication that the viewer has payment activity.

## Verification and limits

The regressions were reproduced against disposable local PostgreSQL before
fixing. The full suite passes 230 tests. The focused cases cover a later expired
round, owner-only return, API-level pickup privacy, contact/disclosure gating,
legacy attestations and conservative payment certainty. All 68 guard mutations
are caught; typechecking and production build pass.

The browser check used actual components and services, fictional preauthenticated
actors and isolated PostgreSQL. It exercised no-contact blocking, explicit notice
consent, the studio's generic notice and four confirmations, withdrawal and the
non-paying peer's short closed-offer state. No PayPal approval was pressed.
The no-contact and closed-offer screens were checked at 375 by 812, without
horizontal overflow; the studio screenshot records the desktop check. The email
used in the contact-enabled local fixture is reserved and fictional. Published contact is also stripped from requests to the existing AI worker,
preserving its protocol without redeploying or changing the model. No email,
external model or payment provider was called. This is not an independent human
study or a real-phone sign-in rehearsal.

No schema migration or hosted record rewrite is required. The repository stays
private, existing Free hosting is retained, and no model allowance was consumed.
Demo video, Devpost work and submission remain deferred. The next product
evidence is the actual phone handoff and independent friends using Rally.

Release status will be recorded after the existing Free deployment is verified.
