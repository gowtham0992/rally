# Develop Rally

Rally is a Next.js application backed by PostgreSQL and Supabase Auth. Its payment
adapter targets PayPal sandbox. Optional AI inference uses Astropods through a
separate authenticated worker, or a development gateway.

Run commands from the repository root. Keep local databases and credentials
separate from the hosted application.

## Requirements

- Node.js 22 or later and npm. Earlier records used Node 25.6.0; the minimal
  studio-reply correction passed the full suite under Node 22.23.4. The hosted
  runtime is pinned in `render.yaml`. Other minor versions are not independently
  covered by that run.
- PostgreSQL 17 for local integration tests, with schema-creation privileges.
  Docker is one way to provide it; an existing disposable instance also works.
- OpenSSL for signature fixtures.
- Supabase Auth for interactive sign-in; PayPal sandbox credentials for actual
  checkout. Neither is needed by the automated test suite.

Install the locked dependencies:

```sh
npm ci
```

## Test without external accounts

The suite creates and removes isolated schemas. It uses controlled Auth, model
and payment responses, with no email, external model requests or PayPal calls.
Use a disposable local database, never the hosted application's connection.

For Docker, start a local PostgreSQL instance:

```sh
docker run --detach --name rally-test-postgres --publish 127.0.0.1:55439:5432 \
  --env POSTGRES_USER=rally --env POSTGRES_PASSWORD=rally_local_only \
  --env POSTGRES_DB=rally postgres:17-alpine
```

If that container already exists, use `docker start rally-test-postgres`.
The username and password above are only for this loopback test instance.
For another local PostgreSQL instance, substitute its connection URL below.
Use UTC as the test database's time zone, matching the recorded test environment.

```sh
TEST_DATABASE_URL=postgresql://rally:rally_local_only@127.0.0.1:55439/rally npm test
npm run typecheck
npm run build
```

`npm test` runs database tests serially. Keep its configured test-concurrency
setting: several fixtures install database extensions during setup.

The optional guard check deliberately changes one source condition at a time,
verifies that its targeted test fails, then restores the source. Run it after
the suite, without concurrent source edits or builds:

```sh
TEST_DATABASE_URL=postgresql://rally:rally_local_only@127.0.0.1:55439/rally npm run test:mutations
```

The [repository verification](../evidence/repository-readiness-2026-11-02.json)
records the clean-checkout checks. The [historical release record](../evidence/current-verification.json)
retains its own dated provider and deployment scopes. Local tests do not establish
actual provider behavior or independent human usability.

## Run the app

Create `.env.local` from [`.env.example`](../.env.example), without overwriting
an existing private configuration. Supply a local application database with
migration privileges and the values needed for the features you will use.
The example database uses port 55432; change it if your local instance uses
55439 or another port.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Application PostgreSQL connection. |
| `APP_ORIGIN` | Fixed trusted origin; use `http://localhost:3000` locally. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Managed Auth URL and client-safe key. |
| `RALLY_RATE_LIMIT_KEY` | Stable private 32-byte hex key for shared quota identifiers. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID` | Sandbox app and merchant configuration. |
| `PAYPAL_WEBHOOK_ID` | Exact registered sandbox webhook subscription ID. |
| `RALLY_AI_WORKER_URL`, `RALLY_AI_WORKER_TOKEN` | Optional HTTPS inference worker and its dedicated private bearer token. |
| `ASTRO_GATEWAY_URL`, `ASTRO_GATEWAY_API_KEY`, `MODEL_DEFAULT` | Development inference fallback when no worker URL is configured. |
| `RALLY_STUDIO_QUESTIONS_ENABLED` | Defaults on; set `false` to pause new studio questions while preserving existing answers and planning restrictions. |
| `RALLY_STUDIO_QUESTION_AI_ENABLED` | Defaults off; opt into question drafting only after verifying a compatible worker or configured development gateway. |
| `RALLY_SETTLEMENT_MODE` | `worker` locally; the hosted preview uses scheduled processing. |

Keep `RALLY_DEMO_ENABLED=false` for ordinary local use. Prepared fictional test
access has separate provisioning requirements; setting a flag does not create
identities or grant a studio role.

Apply migrations as the local database owner:

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
npm run dev
```

Configure the managed Auth project to allow the exact local callback
`http://localhost:3000/auth/callback`, preserving its existing deployed callbacks.
Email-link sign-in uses PKCE and must complete in the browser that requested it.
The app is at `http://localhost:3000`.

Run payment processing in another terminal:

```sh
npm run worker
```

This command loads `.env.local`. It uses actual sandbox provider credentials;
use the automated suite for controlled payment scenarios. Without a running
worker or scheduled runner, payment verification and recovery will not advance.

The [studio setup guide](studio-setup.md) explains how to assign the operator and
publish the catalog before requesting an offer. Actual group checkout requires
one distinct Personal sandbox buyer per participant. Never use live accounts or
reuse one buyer to stand in for every friend.

## Work with AI

The form works without AI configuration. A missing or failed model check leaves
review unresolved; it never waives a requirement or creates a booking. Supply
worker configuration only when you intend to exercise the optional model path.
Temporary development gateway credentials are not production worker credentials.
The [AI worker setup](ai-worker.md) documents the included standalone build,
gateway variables and application connection. Build it from the repository root:

```sh
npm run ai:build
```

```sh
npm run ai:evaluate
```

The default evaluator checks authored baselines with stub transport and makes no
provider calls. Live evaluation is separate, uses credits and needs a bounded
allowance. Do not assume a previous release's allowance permits another run.
See [AI behavior and evaluation](ai-evaluation.md).

Studio-question drafting uses a separate evaluator. Its default mode is a dry
run and makes no provider request:

```sh
node --import tsx scripts/evaluate-studio-questions.ts
```

The [studio-question guide](studio-questions.md) covers migration 017, operator
configuration and release order. A hosted worker reports `questionDraftVersion: 1`
on `/health` when it supports the contract. Health alone does not prove useful
inference. Keep the manual path available and verify consent, privacy and literal
evidence before enabling the optional draft.

## Maintain the documentation

[Verification data](../evidence/current-verification.json) feeds the table in the
[evidence index](../evidence/README.md). The product README links to that record
instead of duplicating release counters.

```sh
node --import tsx scripts/sync-verification-docs.ts
node --import tsx scripts/sync-verification-docs.ts --check
```

Keep credentials, environment files, browser sessions and raw observations out
of Git. The [deployment guide](deployment.md) covers the hosted environment;
local setup does not provision or modify hosted resources.

## Maintain the public guides

The `/docs` site reads only the seven entries in `src/docs/catalog.ts`, each
from `docs/site/`. Known pages are generated at build time. Unknown routes
return the docs not-found view before reading any file. There is no arbitrary
Markdown, repository or raw-file endpoint.

Keep public text separate from internal reviews, deployment notes and private
evidence. The renderer ignores raw HTML and embeds and allows links only to
named public app routes. New routes require an explicit manifest change and
privacy review. Preview desktop, tablet and phone layouts through the existing
Next.js app. Focused checks run with
`node --import tsx --test test/public-docs.test.ts`; they require no credentials
or external services.
