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
Supabase Vault, outside the runtime role's privileges. The SQL refuses browser or runtime access to decrypted secrets. The private
Cron function uses the synchronous `http` extension with strict TLS and a
120-second timeout, keeping authorization headers out of a shared request
queue. Cron runs the fixed function as its owner; clients cannot choose an
offer, price, payer or HTTP destination. One Cron connection waits during the
request; payment state changes happen in the separate bounded web runner. Do not activate it before verifying the deployed endpoint.

## Verified account and limits

- Cloudflare Free manages the domain. The observed eight records include the
  portfolio, Kin and email; there is no `rally` or wildcard record.
- Render Hobby has no card and one verified Free web service. Its $50 hackathon credit expires
  September 30, 2027. The earlier two-$7-service Blueprint was blocked by a
  card requirement and temporary $1 authorization. That plan is superseded.
- Render Free supports custom domains and managed TLS. Idle services sleep
  after 15 minutes and may take about a minute to wake. Restarts are possible.
  One service fits the 750 included monthly instance hours. Included build and
  bandwidth allowances still apply; with no payment method, exceeding them
  suspends services or builds instead of charging a card.
- Rally Supabase is on Free. Vault, `pg_cron` and the synchronous `http`
  extension are installed; one private every-minute Cron job is active.
  `pg_net` setup failed closed because its queue had PUBLIC grants owned by
  the provider. Those setup/diagnostic transactions rolled back; no queue
  extension or secret was left by the failed attempts.

Local proof: 142 tests passed, including seven scheduled-processing tests
and seven offline judge-preparation tests with simulated provider/Auth accounts.
Actual production-build HTTP checks rejected anonymous, wrong-key, query-key
and wrong-method requests; the valid request returned IDLE with zero operations.
Actual hosted proof now includes seven managed judge browser roles, both HTTPS
health endpoints, preserved local/Auth redirects, successful idle Cron receipts
and one database-to-preview authenticated HTTPS request returning IDLE.
`evidence/hosted-settlement-schedule.json` records zero payment operations and
no browser/runtime ability to invoke the private function or read Vault.
Cold wake and active provider recovery remain unverified on the hosted runner.

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
7. The matching Supabase callback/site URL is configured, with existing and
   localhost redirects preserved. The offline `configure-hosted-auth.ts` command
   requires explicit enablement and verified HTTPS readiness, and sends no email.
   Sandbox webhook registration is complete and its actual trusted ID is stored
   in Render privately. Forged-signature denial has been verified on hosting;
   twelve genuine signed authorization/capture notifications were received and processed in the hosted six-friend journey. See [webhook setup](paypal-webhooks.md).
   Verify PayPal return/cancel URLs.
8. Prove actual Cron invocation, cold wake, overlapping/restarted processing,
   sandbox capture/refund recovery, and monitoring of unresolved results. Run
   the complete custom-domain judge journey before using it in instructions.

## Undo and usage

Stop new checkout before web rollback. Keep scheduled processing or an alternate
worker running until all outstanding provider operations are reconciled. Preserve
all payment history and additive schema; never use a populated down migration
as rollback. A DNS change does not compensate a payment. Keep the private trigger
key stable during rollback to a compatible build. A compatible cached-artifact rollback and restoration passed on October 3; in-flight recovery and cold-wake drills remain pending. Review free-tier usage during releases; do not add a card or upgrade.

Render warns that future Blueprint file changes sync automatically and may
change costs. `autoDeployTrigger: off` controls code deploys, not configuration
sync. Review every subsequent `render.yaml` change.

Sources: [Render Free](https://render.com/docs/free),
[Cloudflare DNS setup](https://render.com/docs/configure-cloudflare-dns),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Current preview: [Rally](https://rally.gowthamsarveswaran.com). Render assigned
`rally-mx1y.onrender.com`; Cloudflare has one additional DNS-only CNAME for
`rally`, with the eight previous records preserved. Build `6696eef` is live with the studio payment-resolution page after its compatible rollback and restoration drill.
Judge access is gated by the private code in ignored `.env.demo`; one browser
verification workspace is leased and four hosted workspaces remain available.
The actual six-buyer journey is confirmed: $288 gross, six distinct buyers, one capture per order and all twelve genuine notifications processed. This is fictional PayPal sandbox evidence; actual customer feedback remains unverified. See [settlement evidence](../evidence/web/hosted-six-friend-settlement.json) and [initial rollout/rollback evidence](../evidence/web/hosted-rollout-rollback.json). The subsequent [payment-resolution release](../evidence/web/payment-resolution-release.json) verified studio ownership and participant denial and preserved the booking through rollback/restoration. PayPal Developer confirms [genuine resend delivery and duplicate handling](../evidence/web/hosted-webhook-retransmission.json); no JSON duplicate-response body was captured.

The official judging period runs December 1–15. Four untouched, unclaimed
workspaces now have January 14/15 studio dates via appended catalog versions and
fresh fixture groups. Their old groups, preferences and catalogs are retained;
the leased browser-verification workspace is unchanged. See
[preparation evidence](../evidence/judging-workspace-preparation.json).
The approved `RALLY_DEMO_ACCESS_END=2026-12-16T00:00:00Z` policy is saved in
Render and its environment-only deployment is live on Free. New judge leases
use this fixed end. The existing leased workspace retains its 24-hour duration;
no lease is automatically extended or recycled. Hosted health returned 200 with
`ready: true`; all 35 identities and four available workspaces remain. No new
lease was consumed to verify this configuration, so a fresh hosted fixed-end
lease has not yet been observed. See [activation evidence](../evidence/judge-access-window-activation.json)
and [judge preparation](judge-provisioning.md).

Synchronous transport reference: [pgsql-http](https://github.com/pramsey/pgsql-http).
