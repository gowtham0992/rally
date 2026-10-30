# Operate the hosted sandbox

Rally runs at [rally.gowthamsarveswaran.com](https://rally.gowthamsarveswaran.com)
on the existing Render Free web service. Supabase supplies Auth and PostgreSQL;
a separate Astropods worker handles optional interpretation. Cloudflare supplies
the custom-domain DNS. Keep the existing Free configuration and private secrets
separate from source.

## Service configuration

[`render.yaml`](../render.yaml) declares the web service, build/start commands,
trusted HTTPS origin, readiness path and private environment variables.
Automatic code deployment is off. Blueprint configuration synchronization is
separate: review configuration changes for cost or permission effects before
applying them.

Use the restricted hosted `DATABASE_URL`, client-safe Supabase publishable key,
sandbox PayPal configuration, quota key, settlement trigger key and AI worker
URL/token. Never place Supabase management credentials, database owner access
or Astropods administrative credentials in the web runtime. The AI worker has
no database or PayPal credentials. [Database setup](hosted-database.md).

The Free web service can sleep and needs time to wake. State survives restarts
in PostgreSQL. A successful readiness response does not establish that a group
can finish a payment window; test those transitions separately.

## Settlement and maintenance

The hosted app uses `RALLY_SETTLEMENT_MODE=scheduled`. A private Supabase Cron
function calls `/api/internal/settlement` once per minute while offers or recovery
work exist. It makes no request solely to keep the web service awake.

The endpoint accepts the private 64-hex `RALLY_SETTLEMENT_TRIGGER_KEY` only in a
Bearer header. The key is stored in Supabase Vault, outside browser/runtime
access. The fixed SQL function uses certificate-verified synchronous HTTP;
clients cannot choose its destination, offer, payer or price.

A database advisory lock prevents overlapping runners. Each invocation checks
up to 100 candidate offers, dispatches at most 16 operations and stops starting
steps after its 20-second budget. It still awaits an in-flight provider call;
20 seconds is not a guaranteed response time. A stopped process leaves durable
operation state for reconciliation.

The offline `scripts/configure-settlement-schedule.ts` verifies the live endpoint
before installing [`deploy/settlement-schedule.sql`](../deploy/settlement-schedule.sql).
It requires the private provisioning configuration and explicit enablement.
Do not rerun initial setup or rotate the trigger key as routine release work.
A separate native SQL job maintains [private-text retention](private-text-retention.md).

## Release a change

1. Verify the relevant local behavior, typecheck and production build. For
   payment/privacy changes, run the integration suite and guard checks against
   a disposable database. [Development](development.md).
2. Review source and history for secrets. Keep all private environment files,
   credentials, checkpoints and browser state outside Git.
3. If a schema change is required, apply its additive migration through the
   owner procedure before deploying dependent code. Preserve compatibility
   with existing immutable records and unresolved financial work.
4. Deploy the reviewed commit to the existing Free service. Confirm the actual
   deployed source in Render; `/api/health` reports readiness, not a commit ID.
5. Check public readiness, authentication and foreign-origin denials. Verify
   scheduled processing and inspect unresolved operations without exposing
   raw provider responses or participant notes.
6. Record the deployed commit, verification scope and any remaining limitations
   in the [verification record](../evidence/current-verification.json).

Do not change DNS, Auth allowlists, SMTP, model infrastructure or paid plans as
an incidental part of an application release. A documentation-only commit does
not require a runtime redeploy.

## Domain, Auth and webhooks

The existing `rally` DNS-only CNAME targets the actual Render-assigned hostname,
`rally-mx1y.onrender.com`. Preserve unrelated DNS records and mail configuration.
Use Render's verified custom-domain TLS and the exact HTTPS `APP_ORIGIN`.

Supabase Auth keeps the deployed callback and local development callback
allowlists. Email sign-in uses the existing Resend SMTP setup and PKCE; changing
SMTP does not remove the same-browser requirement.
[Email configuration](free-smtp-2026-10-27.md).

PayPal return/cancel destinations use the trusted application origin. The
registered sandbox webhook ID belongs in private runtime settings.
[Webhook setup and verification](paypal-webhooks.md).

## Recovery and rollback

A compatible application rollback preserves the database schema, immutable offer
and payment records, stable provider operation IDs and scheduled reconciliation.
Stop new checkout before a rollback that could affect financial processing, and
keep a compatible runner available until all outstanding operations are checked.
A DNS change does not compensate a payment.

Never use a populated down migration as production rollback. Do not restore a
build that removes consent, privacy, quota or opt-out protections merely because
it can read the schema. Fix forward if the older artifact would weaken those
invariants. Do not reset a failed payment or create a new provider operation to
hide an uncertain result.

Compatible rollback/restoration exercises exist in the dated release evidence.
The latest correction release did not perform another live rollback. Hosted
partial-failure recovery remains a separate unverified scenario; the recorded
hosted success and local-service recovery runs have different scopes.

See [current verification](../evidence/README.md) and
[development history](history.md) for dated results. Provider references:
[Render hosting](https://render.com/docs),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[Cloudflare DNS for Render](https://render.com/docs/configure-cloudflare-dns).
