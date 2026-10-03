# Rally sandbox hosting

Use `https://rally.gowthamsarveswaran.com` with **one Render Free web service**
and the existing free Supabase project. The participant authorized this domain
and subsequently declined paying or adding a card. No paid worker, AWS service,
workspace upgrade, or new payment method is part of this deployment.

GitHub Pages supports the domain but serves static files. Rally's private APIs,
managed sessions and server-side payment secrets require a server. Moving only
the interface to Pages would not deploy the working product.

## Free execution model

`render.yaml` declares the Free web plan, exact custom domain and HTTPS
`APP_ORIGIN`. Supabase Cron invokes `/api/internal/settlement` once per minute
while offers or recovery work exist. No request is sent solely to keep Render
awake. Supabase retains all durable payment state; the same payment engine
handles operation identity, dispatch leases, verified outcomes and recovery.
The normal local `npm run worker` remains available.

The scheduled endpoint requires `RALLY_SETTLEMENT_MODE=scheduled` and a private
64-hex `RALLY_SETTLEMENT_TRIGGER_KEY`. It accepts the key only as a Bearer header,
not a URL parameter. A database advisory lock prevents overlapping scheduled
runs across processes. Each run checks up to 100 candidate offers, dispatches
at most 16 operations and stops starting steps after its 20-second budget.
An in-flight provider call is awaited; 20 seconds is not a hard response-time
claim. A killed process leaves durable dispatch evidence for reconciliation.
Separate invocations may add minutes to settlement; confirmation still requires
all verified captures before the existing reservation deadline.

The offline `scripts/configure-settlement-schedule.ts` command first verifies
the live authenticated endpoint, then installs `deploy/settlement-schedule.sql`.
It uses the existing private provisioning token. The trigger key is stored in
Supabase Vault, outside the runtime role's privileges. The SQL refuses browser
or runtime access to decrypted secrets or the HTTP request queue. Cron runs the
fixed function as its owner; clients cannot choose an offer, price, payer or
HTTP destination. Do not activate it before verifying the deployed endpoint.

## Verified account and limits

- Cloudflare Free manages the domain. The observed eight records include the
  portfolio, Kin and email; there is no `rally` or wildcard record.
- Render Hobby has no card and zero services. Its $50 hackathon credit expires
  September 30, 2027. The earlier two-$7-service Blueprint was blocked by a
  card requirement and temporary $1 authorization. That plan is superseded.
- Render Free supports custom domains and managed TLS. Idle services sleep
  after 15 minutes and may take about a minute to wake. Restarts are possible.
  One service fits the 750 included monthly instance hours. Included build and
  bandwidth allowances still apply; with no payment method, exceeding them
  suspends services or builds instead of charging a card.
- A read-only Rally Supabase inspection found Vault installed, and `pg_cron`
  and `pg_net` available but not yet installed. No schedule is active.

Local proof: 107 tests passed, including seven new scheduled-processing tests
and four offline judge-preparation tests with simulated provider/Auth accounts.
Actual production-build HTTP checks rejected anonymous, wrong-key, query-key
and wrong-method requests; the valid request returned IDLE with zero operations.
This is not proof of a hosted schedule, real judge login or deployed recovery.

## Release order

1. Verify isolated managed judge sessions, privacy and the complete browser
   journey before opening judge access. Prepared fixture identities are not
   observed human consent or merchant feedback.
2. Preserve the hosted additive schema and restricted runtime/TLS audit. The
   runtime receives the hosted DATABASE_URL, never a provisioning/Admin key.
3. Deploy the reviewed free Blueprint, with automatic code deploys off. Supply
   saved sandbox PayPal, restricted database, Astropods and quota/trigger secrets
   through Render's private environment settings. Keep local origin unchanged.
4. Obtain Render's actual assigned `onrender.com` hostname. Add one Cloudflare
   CNAME named `rally`, targeting that hostname, **DNS only**, TTL Auto. Do not
   guess `rally.onrender.com`, or change apex/www/email/nameservers/global SSL.
5. Verify Render custom-domain ownership and valid TLS. Check `/api/health`
   and the authenticated scheduled endpoint at the custom domain.
6. Load the ignored `.env.schedule` and provisioning configuration, with the
   exact HTTPS APP_ORIGIN and `ENABLE_HOSTED_SETTLEMENT_SCHEDULE=true`, to run
   `node --import tsx scripts/configure-settlement-schedule.ts`. Never commit
   substituted SQL or supply the provisioning token to Render.
7. Register the matching Supabase callback/site URL and sandbox webhook.
   Preserve local Auth redirects. Verify generated PayPal return/cancel URLs.
8. Prove actual Cron invocation, cold wake, overlapping/restarted processing,
   sandbox capture/refund recovery, and monitoring of unresolved results. Run
   the complete custom-domain judge journey before using it in instructions.

## Undo and usage

Stop new checkout before web rollback. Keep scheduled processing or an alternate
worker running until all outstanding provider operations are reconciled. Preserve
all payment history and additive schema; never use a populated down migration
as rollback. A DNS change does not compensate a payment. Keep the private trigger
key stable during rollback to a compatible build. These hosted drills remain
pending. Review free-tier usage during releases; do not add a card or upgrade.

Render warns that future Blueprint file changes sync automatically and may
change costs. `autoDeployTrigger: off` controls code deploys, not configuration
sync. Review every subsequent `render.yaml` change.

Sources: [Render Free](https://render.com/docs/free),
[Cloudflare DNS setup](https://render.com/docs/configure-cloudflare-dns),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
