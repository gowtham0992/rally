# Build and connect the AI worker

Rally includes the complete optional interpreter in `src/ai/` and its shared
contract in `src/planning/interpretation.ts`. The worker drafts activity and
pickup choices or asks one clarification question. The application owns saved
choices, disclosure consent, bookings, quotas and payments.

## Build from source

Use Node.js 22 or later. From the repository root, install the lockfile's
dependencies and build the worker:

```sh
npm ci
npm run ai:build
```

The command uses the pinned esbuild development dependency and produces:

- `deploy/ai-worker/build/worker.mjs`: bundled Node.js entry point.
- `deploy/ai-worker/build/THIRD_PARTY_LICENSES.txt`: the bundled Zod license.

The generated directory is ignored by Git. The source and build script are
tracked; no generated artifact, local environment file or provisioned account
is needed in the repository. Building makes no model call and creates no cloud
resource. The Dockerfile's context is limited to `deploy/ai-worker/`, whose
`.dockerignore` admits only the Dockerfile and those two build outputs.

## Configure model access

The worker reads these server-only settings:

| Variable | Purpose |
| --- | --- |
| `ASTRO_GATEWAY_URL` | HTTPS gateway base URL; Rally appends `/v1/chat/completions`. |
| `ASTRO_GATEWAY_API_KEY` | Private gateway bearer credential. |
| `MODEL_DEFAULT` | Selected gateway model; the blueprint selects `claude-sonnet-4-6`. |
| `RALLY_AI_WORKER_TOKEN` | Private 32-byte, 64-hex service token checked before inference. |
| `PORT` | Listener port; defaults to 80. |

The checked-in `astropods.yml` declares `models.default` with `provider: gateway`.
Astropods injects the gateway URL, credential and selected model into a deployed
container. Configure the worker service token separately as a secret input.
Do not copy an expiring development gateway key into a hosted deployment.

For standalone local operation, place the model configuration and service token
in an ignored `.env.ai-worker.local`, then run the bundle on an unprivileged port:

```sh
PORT=8081 node --env-file=.env.ai-worker.local deploy/ai-worker/build/worker.mjs
```

`GET /health` is public and makes no model call. `POST /interpret` requires the
service token in a Bearer header before input parsing or model dispatch. A health
response establishes process readiness, not model availability. Anonymous
inference receives 403; authenticated malformed input receives 400. The
automated worker tests cover these boundaries using controlled model responses.

The application requires an HTTPS worker origin. For ordinary local application
development, leave `RALLY_AI_WORKER_URL` unset and use the development gateway
settings directly, or configure a properly authenticated HTTPS worker. Do not
weaken that origin validation to connect the standalone HTTP listener.

## Connect the hosted application

Build the bundle before packaging the included Dockerfile and private Astropods
blueprint. The existing worker exposes its frontend on the platform-provided
HTTPS origin. Blueprint visibility and frontend transport access are separate
settings: machine access must reach the worker without an Astropods-account
login, while Rally's own bearer-token check remains required on `/interpret`.

Set `RALLY_AI_WORKER_URL` in the application's private runtime settings to that
HTTPS origin, with no path, query or fragment. Set `RALLY_AI_WORKER_TOKEN` to the
same secret used by the worker. The web application still needs its normal
database, Auth, quota and PayPal configuration; the worker receives none of
those credentials. [Application setup](development.md#run-the-app).

The existing preview uses a Free compute configuration and existing model
credits. Source reproduction does not require provisioning a hosted agent;
deployment and actual inference depend on the operator's account and allowance.
Check those separately before dispatching any model evaluation.

The worker accepts only the closed interpretation contract and returns a
proposal or review result. Its diagnostic logs contain bounded failure
categories rather than user messages, credentials or raw model responses.
[AI behavior and evaluation](ai-evaluation.md) describes source grounding,
confirmation, privacy and evaluation limits.

Provider references: [Astropods AI Gateway](https://docs.astropods.com/ai-gateway),
[blueprint specification](https://docs.astropods.com/astropods-package-spec).
