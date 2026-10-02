# Demo studio setup

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

This is a synthetic studio setup, not validation by a real merchant. The observed
local UI fixture uses the same managed account for organizer and test operator,
with other participants and collection agreements seeded through trusted service
actors. Separate operator/participant browser access and actual merchant feedback
remain required. Checkout and merchant cancellation are being integrated;
opening an offer alone does not book a session or move PayPal money.
