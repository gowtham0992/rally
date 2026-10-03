# Rally

Six friends, one studio booking, everyone pays their own share.

Rally finds a published session that fits each friend’s confirmed requirements
without exposing their spending limits. A friend can clarify an ambiguous note,
arrange collection with another friend’s explicit agreement, and review the
same fixed offer as everyone else. The studio approves the reservation; each
participant approves their own PayPal sandbox payment.

**Preview:** [rally.gowthamsarveswaran.com](https://rally.gowthamsarveswaran.com).
The app uses a fictional studio and sandbox money. Judge entry requires a
private access code and has five isolated, non-recycled workspaces; three remain
untouched after verification. New sessions end December 16 at 00:00 UTC. Render
Free may take about a minute to wake after inactivity.

## What has been verified

| Evidence | Verified scope |
| --- | --- |
| [PayPal sandbox report](evidence/paypal-sandbox/index.html) | Three distinct buyers completed a $144 booking. A separate partial failure refunded one $48 capture and voided the other two authorizations. A deliberately dropped capture response recovered after restart without an extra capture. Each result was independently checked through PayPal GETs. |
| [AI evaluation](evidence/ai/evaluation-index.json) | 24 authored cases, repeated three times: 72/72 final quality assessments passed, zero safety failures. The equal structured baseline and hard-constraint oracle are independent. Earlier failed runs remain in the history. |
| [Hosted preview](evidence/hosted-preview.json) | Valid custom-domain HTTPS, one Render Free service, seven distinct managed demo roles, private preferences and separate studio scope. |
| [Fresh judge access](evidence/web/hosted-judge-window.json) | Deployed HTTP entry received the fixed December 16 lease. All seven roles, stale-viewer denial, lease-only sign-in restoration and foreign-group/offer denial passed. Existing financial and intake history stayed unchanged. This was a separate HTTP client, not a fresh browser-entry recording. |
| [Hosted scheduler](evidence/hosted-settlement-schedule.json) | Private Supabase Cron/Vault transport reached the deployed settlement endpoint and completed idle runs. Cold wake and active payment recovery are still pending. |
| [Webhook tests](evidence/webhook-local-verification.json) | Original-byte RSA verification, hostile certificate URLs, bounded input, duplicate authentication and safe errors. Disposable test certificates are used locally. |
| [Hosted signature denial](evidence/hosted-webhook-signature-denial.json) | The live receiver rejected a forged signature using a real PayPal public certificate. Payment and notification records remained unchanged. |
| [Private note expiry](evidence/web/private-text-retention.json) | Actual native hosted cleanup removed an isolated fictional note and AI quotation while preserving existing financial and consent history. [Policy and setup](docs/private-text-retention.md). |
| [Studio payment reports](evidence/web/payment-evidence.json) | Authenticated local UI saved one unverified fictional report without changing simulated payment, booking or reservation records. Stale-state and connection failures preserve the draft. |
| [Video review cut](evidence/video/review-cut.json) | A 163-second private draft uses real UI stills, temporary local narration and a separately labeled three-buyer report. It is not the final interaction recording or public video. |

The latest full suite has **151 passing tests** using isolated local PostgreSQL
schemas and controlled provider/Auth/model fixtures. All 40 deliberate guard mutations
were caught. TypeScript and the production build pass.

The six-buyer hosted browser booking and genuine signed webhook delivery are
verified, including a delivered duplicate event. Active hosted failure recovery,
real user/merchant feedback and the finished demo video remain open gates. Prepared friends and studio facts are
fictional demo data. Engineering evidence is not a customer success rate.

## Run locally

Use Node.js 22 or newer, npm, Docker and OpenSSL. OpenSSL creates disposable
certificates for the signature tests; no test key is committed. Start a local
PostgreSQL database with credentials used only for this development container:

```sh
npm ci
docker run --detach --name rally-postgres --publish 127.0.0.1:55432:5432 \
  --env POSTGRES_USER=rally --env POSTGRES_PASSWORD=rally_local_only \
  --env POSTGRES_DB=rally postgres:17-alpine
npm run db:migrate
npm run typecheck
npm test
npm run test:mutations
```

If the container exists, use `docker start rally-postgres`. Tests create and
remove their own schemas; they do not truncate application tables. The test
login needs schema creation privileges. Hosted runtime credentials are restricted
and must never use this development login.

Copy the example without replacing an existing configuration:

```sh
cp -n .env.example .env.local
```

Configure the existing Supabase project’s `SUPABASE_URL` and client-safe
`SUPABASE_PUBLISHABLE_KEY`. Use `APP_ORIGIN=http://localhost:3000` and allow
exactly `http://localhost:3000/auth/callback` in Supabase Auth. Generate a stable
private `RALLY_RATE_LIMIT_KEY` with `openssl rand -hex 32`. Keep runtime keys in
ignored environment files or your hosting provider’s private settings.

```sh
npm run dev
npm run worker
```

Run the worker in a second terminal. The app is at `http://localhost:3000`.
Managed email login uses your own email and a sign-in link. Judge identities
use a separate HttpOnly cookie namespace and are provisioned offline; see
[judge provisioning](docs/judge-provisioning.md). No Auth Admin or Management
token belongs in the running web app.

## Configure PayPal sandbox

In [PayPal Developer](https://developer.paypal.com/dashboard/), select Sandbox.
Create the REST app under one Business seller. The isolated CLI proof needs
three distinct Personal buyers; the published six-person product booking needs
six distinct Personal buyers. Do not lower the studio capacity or reuse a payer
identity to manufacture a six-person booking.

Save `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and the seller’s
`PAYPAL_MERCHANT_ID` privately. `PAYPAL_BUYER_IDS` contains the three personal
payer IDs, comma-separated in approval order, for the CLI harness. These are
account IDs, not email addresses. Keep buyer passwords in PayPal’s dashboard.

```sh
npm run sandbox -- doctor
```

The doctor reports configuration presence without printing values. The payment
adapter has a fixed sandbox API origin and no live endpoint setting.

## Reproduce the three-buyer payment proof

Use a fresh offer for each scenario and finish reconciliation between runs.
Stop the background worker during these fault scenarios: the CLI provides the
barrier between captures.

1. Run `npm run sandbox -- init` to create a labeled $48-per-person test offer
   and obtain three approval links.
2. Approve each link using its corresponding distinct Personal sandbox account.
3. Run `npm run sandbox -- authorize`. It checks payer identity and authorization
   qualification, then stops before capture.
4. Run the selected scenario and verify the actual provider resources.

| Scenario | Command and expected outcome |
| --- | --- |
| Success | Repeat `npm run sandbox -- step` until CONFIRMED. All three captures must be COMPLETED. |
| Partial failure | `npm run sandbox -- partial-failure` captures A, pauses, deliberately voids B’s authorization through PayPal, resumes, and compensates. The booking must abort; A’s refund and remaining voids must complete. |
| Lost response | `npm run sandbox -- lost-response` drops a successful capture response locally, then recovers through GETs. It must not create a replacement charge. |

`npm run sandbox -- status` shows private participant status.
`npm run sandbox -- evidence` saves reviewed run material under ignored
`evidence/private/`. `scripts/verify-sandbox.ts` independently reads provider
resources for the documented scenarios. No pending or unknown result counts as
completed; continue reconciliation or retain an explicit action-required state.

## Product and payment boundaries

Private budgets, notes and proposals are actor-scoped. The organizer sees
readiness, not peer spending limits. Protected browser mutations check the exact
configured Origin and a verified managed identity. The provider webhook uses
its signature instead of browser authentication; the internal settlement route
uses its private Bearer key.

The AI receives only the consenting participant’s note and published studio
facts. It proposes a bounded clarification grounded in an exact quotation.
The participant confirms meaning; the shared deterministic planner applies
published prices, availability, technique, outcome, collection and consent
requirements. Unsupported or unresolved needs block an automatic offer.
`?mode=structured` preserves the same inputs and note-review controls without
an AI suggestion. See [the AI protocol](docs/ai-evaluation.md).

Only the registered studio operator can approve a current request. Approval
atomically reserves the session’s buffered resource interval and freezes its
catalog facts, roster, price and cancellation terms. Preference changes
invalidate drafts; issued offers cannot be rewritten.

Each accepted share creates a participant-owned AUTHORIZE order. Returning
from PayPal is not proof of approval: the server checks the stored order and
payer. Sequential capture begins only after all required authorizations qualify.
A booking confirms only after every capture is verified and the reservation
still qualifies before its deadline. Failed or late settlement schedules actual
refunds and voids; unresolved results remain visible.

Durable operations retain their original request IDs and payload hashes. Stale
workers cannot overwrite newer results. Unknown outcomes are checked through
GETs; replay is disabled when retention is unknown or expired. Provider links
cannot select an untrusted outbound destination. PostgreSQL enforces overlapping
reservation exclusion and persistent webhook deduplication.

Studio cancellation releases inventory and schedules full refunds. A participant
cancellation request alone changes no booking. Another planning round opens only
when the prior round’s financial recovery is complete. See
[studio setup](docs/studio-setup.md) and the scoped
[cancellation evidence](evidence/web/cancellation-flow.json).

## Free deployment

The live preview uses one Render Free Node service, the existing Supabase Free
project, and a DNS-only Cloudflare CNAME for the subdomain. The local origin and
other domain records are preserved. `render.yaml` keeps code deploys manual and
stores no credentials.

Supabase’s private Cron function invokes bounded settlement processing only
while offers or recovery work exist. It uses synchronous HTTPS with verified
TLS and a private Vault key; no shared HTTP request queue or paid worker is used.
The app runtime cannot read Vault or invoke the private Cron function.

Read [deployment](docs/deployment.md), [hosted database](docs/hosted-database.md),
[shared request limits](docs/request-limits.md) and
[PayPal webhook configuration](docs/paypal-webhooks.md) before reproducing hosting.
The sandbox webhook subscription is registered and its trusted ID is saved in
Render. All twelve genuine notifications for the hosted six-buyer booking were
processed. PayPal Developer also confirms a delivered duplicate with HTTP 200;
the original receipt and six captures stayed unchanged. See
[webhook retransmission evidence](evidence/web/hosted-webhook-retransmission.json).

Before rollback, stop new checkout and preserve compatible recovery processing
until outstanding financial work is reconciled. Keep payment history and additive
schema. Removing the trusted webhook ID makes the receiver fail closed; that
disabled gate was exercised on hosting. Full active-payment rollback and cold
wake drills remain pending.

## Demo and release

The [155-second recording plan](docs/demo-plan.md) follows one six-friend booking
and identifies the separate three-buyer recovery proof. The actual recording and
public YouTube video are not finished. Source uses the [MIT license](LICENSE);
[gowtham0992/rally](https://github.com/gowtham0992/rally) is the sole working
repository, containing the application, assets, license, setup instructions and
development history. It stays private until the owner is ready to submit.
The duplicate snapshot repository and its local checkout were removed with
the owner's approval; its Git history remains in an ignored private backup.
See [repository policy and release history](docs/public-source.md) and
[clean setup verification](evidence/clean-source-setup.json).
The [working submission copy](devpost-submission.md) covers the current official
form, scoped evidence and remaining release gates. Its description and tool list
were saved to the existing [Devpost project](https://devpost.com/software/rally-m2lakh).
Saving unexpectedly published the project page; it is hidden from the owner's
portfolio, but its direct URL remains accessible. The hackathon entry remains
incomplete and unsubmitted, and the video is missing. See
[the verified save record](evidence/devpost-project-save.json).
