# Hosted PostgreSQL

Rally uses its existing Supabase project for Auth and durable Postgres storage.
The application schema is `rally_private`, outside the exposed Data API schemas.
The server connects through the session pooler as `rally_app`. This role can use
Rally tables but cannot create schemas, manage roles, bypass RLS, or read Auth
users. `rally_owner` has no login and owns the schema/migrations.

For initial provisioning and later additive migrations, create an ignored,
mode-600 `.env.provision` containing `SUPABASE_URL`,
`SUPABASE_MANAGEMENT_TOKEN`, and optionally `HOSTED_PROJECT_NAME` (default:
`Rally`). The project must be healthy and match the expected name. Then run from
the repository root:

```sh
node --env-file=.env.provision --import tsx scripts/hosted-database.ts
```

The script uses the official Management API, a transaction and migration lock.
It does not rotate existing passwords or overwrite an unknown existing role.
Keep its ignored `evidence/private/hosted-role-checkpoint.json` safely backed up;
losing it requires deliberate credential recovery. Neither that file nor the
management token belongs in a deployment or public repository.

`.env.hosted` contains the generated runtime connection. Supply only its
`DATABASE_URL` to the web service and settlement worker; keep local development
and test database URLs separate. Apply migrations before deploying dependent
code. The normal `scripts/migrate.ts` runner is for a migration owner, not this
restricted runtime role. A down migration is not an automatic production undo.

The connection uses `sslmode=verify-full` and `sslrootcert=certs/supabase-ca.crt`.
Run services from the repository root. The checked-in **public** certificate was
downloaded from Supabase’s official certificate endpoint, has SHA-256 fingerprint
`807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`, and expires
April 26, 2031. Do not disable certificate/hostname verification to fix a
connection failure. Verify any future certificate update against the official
source.

Run the connection/access audit after provisioning:

```sh
node --env-file=.env.local --env-file=.env.hosted --import tsx scripts/verify-hosted-database.ts
```

The actual connection audit in `evidence/hosted-database.json` proves verified
TLS **from Rally to the session pooler**. Supabase reports its internal
pooler-to-database connection as non-TLS; the audit does not claim encryption on
that provider-managed hop. The audit also verified a rolled-back synthetic write,
the ten migrations present at that historical checkpoint, denied browser schema privileges, and an HTTP 406 when
a browser key requested the private schema through REST. It is not proof of
application deployment, multi-account login, or a hosted payment journey.

Sources: [custom roles](https://supabase.com/blog/postgres-roles-and-privileges),
[private schemas](https://supabase.com/docs/guides/database/tables),
[pooler and verified TLS](https://supabase.com/docs/guides/database/psql),
[public root certificate](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt),
[node-postgres SSL](https://node-postgres.com/features/ssl).

Migration 012 adds [private-note expiry](private-text-retention.md). That dated
retention audit verified the twelve migrations present for its release, certificate-verified restricted
access, denied browser execution and denied runtime policy changes. Native SQL
Cron removed an isolated fictional test note and quotation while preserving
existing payment, consent and confirmed-choice digests. See
[retention evidence](../evidence/web/private-text-retention.json).

## Current schema

The authoritative ordered migration list is `src/migrations.ts`; the current
application includes sixteen migrations through `016_message_drafts`. Earlier
audit files retain their original migration counts. Optional contact data and
studio confirmation consent use validated catalog/preference JSON rather than a
new SQL migration. Current release and protected-history checks are recorded in
[verification](../evidence/README.md).
