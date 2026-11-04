# Studio setup

The studio interface is `/studio`. It is protected by the managed session and
an owner assignment in `merchant_studios`; knowing a URL never grants approval
access. A verified participant is not automatically a studio operator.

For a deployment, first have the intended operator sign in through Supabase.
Copy that account's User UID from the Supabase Auth user dashboard into an
ignored server setup environment as `DEMO_STUDIO_OPERATOR_USER_ID`. Confirm it
is the intended operator. Configure the existing sandbox merchant ID as
`PAYPAL_MERCHANT_ID` and set `ENABLE_DEMO_STUDIO_SETUP=true`. Run from the repo root
with the selected application database environment:

```sh
node --env-file=.env.local --import tsx scripts/configure-studio.ts
```

For hosted setup, also pass `--env-file=.env.hosted` after `.env.local` to select
the restricted hosted application connection. Do not supply a Supabase management
token to the web service. The operator setup values are not required by normal
web or worker processes. The script refuses mismatched existing assignments or
catalogs and never overwrites an immutable published version. The default demo
catalog reserves one exclusive resource with 15 minutes of setup and 20 minutes
of cleanup.

The group organizer can ask for a validated published candidate. The request
appears only in the assigned operator's bounded queue; private budgets, raw notes
and user IDs are absent. The operator reviews the exact session, total price,
roster, collection agreements, cancellation terms and occupied calendar interval.
Four unchecked attestations are required. One idempotent approval freezes the
offer and roster, reserves the buffered interval, and opens the two-hour payment
approval window. Changes before issuance invalidate the old request.

The current catalog is a fictional pottery studio with PayPal sandbox payments.
Checkout, studio cancellation and payment-resolution views are implemented.
Opening an offer alone does not book the session or complete a payment. The
[verification index](../evidence/README.md) distinguishes recorded sandbox
results from independent friend or merchant observations.

## Dates in a fresh local installation

`fixtures/studio.json` is a versioned fictional example with fixed November
2026 slots. For a new local database used after those dates, choose future UTC
`slots[].startAt` values and a new `versionId` before the first studio setup.
Keep slot IDs and offering references consistent. The application and setup
script both read this file; restart or rebuild the application after changing it.

This is preparation for a fresh installation, not a migration of an existing
booking. Never change an already published version or its issued offers. The
hosted judge workspaces have their own immutable future catalog, independent
of the default source fixture. Existing evaluations retain the original dates.

## Publish contact details for personal arrangements

The catalog accepts an optional `contact.email` field. Publish only a monitored
contact that belongs to the study operator or studio, with that operator's
authorization. It must be a genuine route for answering a participant's needs;
never add a placeholder to make a blocked plan appear ready. The current hosted
fictional catalog has no contact.

Catalog versions are immutable. A contact change belongs in a new published
version, and the application/planning catalog must match that version before a
new request can be accepted. Do not patch an existing catalog, preference or
issued financial snapshot. The setup command refuses a mismatched published
version rather than silently replacing it. Merchant onboarding and publication
are operator tasks, not permissions granted by signing into the participant UI.

A person who actually checks their needs directly can explicitly consent to a
generic studio notice. The studio sees that a guest reports personal
arrangements, without a name or private note attached to the notice, and its
existing delivery confirmation includes those arrangements. This remains a
participant assertion, not a verified capability. With no published contact,
that external confirmation path stays unavailable. Guests can instead ask a
private in-app question when a studio operator and published catalog are
configured. Answer Guest questions in `/studio`, stating any conditions for the
exact session. The guest must review and accept a positive reply; accepted
arrangements appear again during the normal studio review.
[Studio questions](studio-questions.md).

## Investigate payment outcomes

Studio bookings link to `/m/exceptions` when a payment needs attention. The
operator can request a check of an existing eligible operation or append a
bounded transaction/support reference. Neither action declares success, creates
a replacement charge or overrides the settlement engine. Refunds and released
holds remain unresolved until the provider confirms them.

See [payments and privacy](payments-and-privacy.md), [architecture](architecture.md)
and [webhook setup](paypal-webhooks.md).
