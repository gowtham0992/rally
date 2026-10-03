# Rally

Rally helps a group agree on a studio experience privately, then book with each person paying their own share through PayPal.

The current implementation covers durable payments, persistent private intake, collection consent, deterministic planning and merchant-approved frozen offers. The local participant web application supports managed login, private intake, studio offers and individual sandbox checkout; complete multi-account browser verification remains pending. Three distinct buyers completed actual PayPal sandbox success, partial-failure compensation and dropped-response reconciliation after a worker restart. Synthetic offers are not real studio availability.

## Run the local checks

Use Node.js 22 or newer, npm, and Docker. These commands create a local-only PostgreSQL database; the password below is exclusively for this disposable development database.

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

If the container already exists, use `docker start rally-postgres`. Tests create and remove isolated schemas. They never truncate application tables. The test database user needs schema creation privileges; use a separate database and restricted server credentials when deploying.

## Configure the actual PayPal sandbox proof

In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/), select Sandbox. Use one business merchant and three distinct personal buyer accounts. Create a sandbox REST app belonging to that business account. [Sandbox account instructions](https://developer.paypal.com/tools/sandbox/accounts/).

Copy `.env.example` to `.env.local` without overwriting an existing configuration:

```sh
cp -n .env.example .env.local
```

Set the sandbox app's `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and business account's `PAYPAL_MERCHANT_ID`. Set `PAYPAL_BUYER_IDS` to the three personal account IDs, comma-separated in the order they will approve the links. Account IDs are not email addresses. Keep passwords in the PayPal dashboard; do not put them in this repository or chat.

```sh
npm run sandbox -- doctor
```

The doctor prints whether values are configured, never their contents. It exits with status 2 when configuration is incomplete. The adapter uses a fixed sandbox API origin and offers no live endpoint setting.

## Execute the three-buyer lifecycle

The three scenarios below have been executed against **actual PayPal sandbox**. This proves the CLI/payment-service composition, not a finished web application. Do not run the background worker during these fault scenarios: the command runner supplies the deliberate pause between captures.

1. Run `npm run sandbox -- init`. It creates a labeled synthetic $48-per-person offer and prints three sandbox approval links.
2. Approve each link with its corresponding distinct personal sandbox account.
3. Run `npm run sandbox -- authorize`. The server authorizes the approved orders and checks the actual payer identities. It stops before any capture.
4. Choose one scenario below. Use a fresh run for each scenario and finish financial reconciliation before starting another.

| Scenario | Command and expected evidence |
| --- | --- |
| Success | Run `npm run sandbox -- step` repeatedly until the booking confirms. All three captures must be completed. |
| Partial failure | Run `npm run sandbox -- partial-failure`. It captures the first payment, pauses, deliberately voids the second authorization through PayPal, resumes, and checks compensation. The booking must abort. |
| Lost response | Run `npm run sandbox -- lost-response`. It discards a completed capture response locally, then attempts read-only reconciliation. It must never create a replacement charge. |

Use `npm run sandbox -- status` to inspect each private payment status. Use `npm run sandbox -- evidence` to save sanitized application and provider resource states under ignored `evidence/private/`. Review files before sharing. A screenshot or simulation does not satisfy the integration gate.

A pending or unknown payment is not a completed payment. If reconciliation is still needed, wait and run `step` again. The autonomous `npm run worker` process checks unresolved operations; do not run it concurrently with the deliberate fault commands above. Exceptions remain visible and owned by the studio rather than being marked successful after retries.

## Financial boundaries

Each buyer approves their own `AUTHORIZE` order with one purchase unit. Rally records exact-offer acceptance, verifies authorization, and starts sequential captures only when every required member qualifies before the deadline. These separate payments are not atomic. A partial failure requires voiding uncaptured authorizations and refunding completed captures.

Dispatch intent, operation identity, and results are durable in PostgreSQL. Unknown responses pause settlement. The worker performs resource reads before any supported idempotent replay. Current endpoint documentation does not specify a retention duration, so the PayPal adapter disables automatic mutation replay until that duration is verified. Unknown operations without discoverable resource IDs require verified webhook correlation or merchant reconciliation.

Webhook signatures are verified through PayPal, events are deduplicated, and event status claims do not directly mark payments complete. Amounts, currency, merchant, invoice or parent-resource binding, and current provider status must match. [Authorization and capture](https://developer.paypal.com/v5/checkout/auth-capture/), [idempotency limitations](https://developer.paypal.com/api/rest/reference/idempotency/).

## What remains

The shared planner enforces confirmed budgets, availability, technique, outcome, finish times, and collection consent against published catalog facts. It excludes unverified offerings and produces a shared projection without private budgets or participant identities. The synthetic catalog lives in `fixtures/studio.json`.

The model boundary accepts only finite interpretations with matching source text and revisions. It cannot accept payment actions or invented offering identities. Managed Supabase authentication and bounded Astropods clarification are integrated. The owner explicitly confirms any interpreted requirement; a structured-only path is also available. Private intake, collection consent and merchant approval are implemented at the PostgreSQL service layer. The local planning checks are not the required 24-case model evaluation and establish no AI superiority.

The [build contract](build-contract.json) retains the full product scope. Remaining gates include webhook delivery/signature testing against PayPal, multi-account managed-auth verification, full browser payment recovery, observed usability, deployment, observed usability and merchant validation, and submission materials. None is implied complete by green local payment tests.

Code is licensed under MIT. Dependencies retain their respective licenses.

### Persistent private intake (service layer)

`src/intake/service.ts` stores groups, memberships and immutable confirmed
preference revisions. Mutations bind a trusted verified actor, record command
results transactionally, reject conflicting retries and stale aggregate or
preference revisions, and invalidate cached planning after changes. Organizer
roster projections contain display names and readiness only. Exact roster
closure requires every selected member to have saved preferences and includes
the organizer. Shared planning uses the existing deterministic validator.

These are **service-level PostgreSQL checks**, not a completed authenticated
web application. Managed Auth verification must construct `IntakeActor` on the
server; request bodies must never supply it. Published catalog selection must
also come from trusted server configuration, rather than participant-supplied
catalog JSON. The tables have RLS enabled with no browser policies, for
server-only access. Grounded clarification commands and managed authentication are integrated;
private-text retention scheduling remains required work. A nomination without consent remains unresolved.

The intake tests exercise cross-user denial, safe organizer projections,
concurrent edits, retry after restart, exact roster closure, immutable history,
candidate invalidation, infeasibility and isolated migration reversal. The
reservation concurrency test verifies exactly one persisted reservation; its
loser can receive an exclusion violation or a transaction deadlock. Production
merchant approval will need to report or retry these conflicts safely.

Collection consent is bound to the current preference revision and admitted
roster. The owner explicitly permits name disclosure and proposes the nominated
collection; the nominee separately accepts the undertaking and disclosure. Only
these two parties can mutate it. Either can revoke it; a revoked revision cannot
be revived. A new preference revision requires new agreements. Requests disclose
names and consent status only, and appear to the nominee after owner disclosure
consent. The deterministic planner consumes these persisted consent records.
Consent changes invalidate cached candidates and retain append-only events.

Issued offers currently return `COLLECTION_REVIEW_REQUIRED` for consent changes.
An OPEN participant can withdraw the offer; after recovery, the organizer can
reopen planning so requirements and arrangements can be revised. Settling or
confirmed bookings require studio cancellation review. No issued offer is silently revised.

### Merchant approval and frozen offers (service layer)

`BookingService.request` binds an organizer-selected candidate to a closed,
ready roster, current preference/consent revisions and an immutable published
catalog. Preference edits or collection revocation before issuance invalidate
pending review and return the group to planning. Merchant request views contain
published facts, agreed names and collection arrangements; no private ceilings
or participant wording.

`BookingService.approve` requires the configured studio operator to explicitly
confirm facts, block the external calendar, permit automatic settlement and
agree to collection arrangements. It revalidates the current source, serializes
this studio's resource, then creates the offer, member payment identities,
immutable snapshot and exclusive buffered hold transactionally. The window is
two hours plus thirty minutes for confirmation; the session must begin at least
24 hours after that window. The existing payment worker handles these issued
offers. Concurrent overlapping approvals return a reservation conflict.

Database triggers protect published catalog versions, offer snapshots, issued
money/time terms and roster identities, and confirmed preference history. Raw
optional text can be cleared by a retention job. State/payment fields remain
mutable for settlement and recovery. Browser access remains disabled by RLS.
Studio ownership, PayPal merchant identity and published catalog provisioning
are trusted server configuration; no browser can grant itself merchant access.
Managed identity, studio approval and participant checkout screens are integrated.
Independent managed-account and complete PayPal browser verification remain required.

Sixteen merchant-loop tests use real PostgreSQL and a **simulated payment provider**.
They cover six-person successful settlement, partial-payment compensation,
overlapping reservations, immutable snapshots, unauthorized access, required
merchant attestation, unsupported catalogs, session lead time and invalidated
review. They do not establish actual PayPal sandbox payment or real availability.

### Independently verify a sandbox run

```sh
npm run sandbox:verify -- success
npm run sandbox:verify -- partial-failure OFFER_UUID
npm run sandbox:verify -- lost-response OFFER_UUID
```

The optional UUID selects a recorded run; without it the current CLI session is
used. Verification performs read-only PayPal resource queries, checks exact
merchant/order/member bindings, configured distinct buyers, USD amounts,
authorization ownership and every provider capture ID. It verifies refunds and
voids for the deliberate failure; for the dropped response it also requires
recorded unknown/reconciliation events. The application never replays the
uncertain capture in these runs. Capture status can become `REFUNDED` after a
completed full refund. Evidence includes source hashes, provider states, gross
amounts, seller fee/net details and the application event history. Generated
evidence remains under ignored `evidence/private/` until reviewed for sharing.

Actual sandbox results do not establish managed-auth correctness, real merchant
availability, mobile usability, model quality, incoming webhook verification or
conversion lift. The separate synthetic AI evaluation is described below; other
release gates remain open.

Reviewed actual sandbox records and their execution/verification source metadata
are in [the evidence report](evidence/paypal-sandbox/index.html). Private app
credentials, generated buyer passwords and buyer emails are excluded.

## Local web application (in progress)

The Next.js app now includes email magic-link login, group creation/joining,
private confirmed requirements, one organizer roster review, and shared
structured candidate checks. It uses Supabase **Auth** with server-validated
`getUser()` identity and an HTTP-only cookie session; the current application
**database remains the isolated local PostgreSQL instance**. The private hosted database is migrated, and merchant/checkout browser screens are implemented. Full multi-account browser recovery and deployment remain unfinished gates.

In `.env.local`, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (a modern
publishable key or legacy anon key), `APP_ORIGIN=http://localhost:3000` and
`DATABASE_URL`. Add the exact `http://localhost:3000/auth/callback` redirect in
Supabase Auth settings. Keep email verification enabled. Do not use a management
token or service-role secret as the browser/client key. Rally’s supplied project
configuration has been checked privately and that exact callback added.

Run `npm run dev`, then open `http://localhost:3000`. Open email links in the same
browser that requested them; the login uses PKCE. `npm run build` verifies the
production compilation; `npm start` starts that compiled app. No email has been
sent by automated verification. The user completed email sign-in, and authenticated synthetic group creation,
requirement saving and persistence after refresh have been observed. Multi-member
joining, the full roster/consent journey and checkout still need browser proof. Supabase’s default email
sender may restrict recipients/rate; configuring judge access is a release gate.

All mutation routes require the configured exact Origin. Identity and email
verification are derived server-side, never accepted from request bodies. Private
responses use `no-store`; streamed JSON request size is bounded. Additional
wording requires review and blocks an offer until its owner confirms a grounded
clarification, updates their selections, or explicitly states that the selected
controls capture every essential requirement. A caller cannot clear review by
sending a “no extra requirement” flag. The UI labels the demo studio and PayPal
sandbox, and keeps offer and payment states truthful. This is a running implementation slice, not a deployed or
submission-ready product. Public deployment also requires durable application
isolated judge access; shared request quotas are implemented below.

### Credited AI and hosting

The Astropods account is connected with its official CLI. Gateway credentials
live only in ignored `.env.local`. `src/ai/clarifier.ts` makes a single bounded
model call and validates the proposed meaning against the closed interpretation
schema. Exact quotations are grounded in the supplied text; missing or ambiguous
quotation locations fail closed. The model cannot update confirmed requirements,
book a session, call tools, or authorize payment. Model failure returns review.
The actual connection check is recorded in `evidence/ai/connection.json`; the
72-run synthetic quality evaluation passed after prompt refinement; both earlier failed runs are retained in `evidence/ai/evaluation-index.json`. The private participant UI now
requires model-processing consent, shows a finite grounded proposal, and saves
changes only after owner confirmation. One actual synthetic travel clarification
and the structured-only alternative were observed in the authenticated browser;
see `evidence/ai/participant-flow.json`. These are connection/journey checks,
not evidence of model quality or conversion lift.

Clarifications are bound to immutable source revisions. Duplicate requests
dispatch at most once; late or interrupted responses return to review. Limits
persist in PostgreSQL: two questions and four calls per member per round, and
six requests per verified actor in a rolling day. Collection clarification never
selects a volunteer or grants either party’s consent. `?mode=structured` hides
the AI option while preserving the same private fields and explicit note review.
Apply migration `007_clarifications` before starting the updated application;
the database role must be server-only.

`render.yaml` prepares one **Free** web service, with manual code deploys and
secrets supplied in Render. Supabase Cron will invoke a private, bounded payment
processing endpoint while offers or recovery work exist; no paid worker is
provisioned. The scheduler and custom domain are not live yet. `/api/health` checks the app database
without exposing database errors. The hosted database has been provisioned; deployment configuration must be
migrated with a restricted application role before deployment. Set `APP_ORIGIN`
to the final HTTPS address and allow exactly its `/auth/callback` in Supabase.
Do not deploy with the local database URL. No real payments are enabled.

Rollback for this first sandbox deployment: stop new checkout before rolling
back the web service; keep scheduled processing or the worker running until outstanding payment results
are reconciled and recovery is complete. Preserve the hosted database and payment
history, then redeploy the previous compatible commit against the additive
schema. This remains a planned procedure until exercised against hosting.
Observe health failures and worker step failures immediately after deployment;
do not enable checkout while these are unresolved. The intended custom domain,
verified credit preflight and DNS sequence are in [the deployment plan](docs/deployment.md).

### Hosted database and collection UI

The existing Rally Supabase project has a private application schema and a
restricted server login. All ten migrations are installed. The connection
verifies the provider certificate and hostname using the bundled public root.
Browser roles cannot access this schema. See [hosted database setup](docs/hosted-database.md)
and the scoped [hosted audit](evidence/hosted-database.json). The local app still
uses local PostgreSQL; Render deployment remains pending.

Saved participant details now collapse into a private summary. Collection
requests require separate owner and nominee agreements; the owner sees a pending
request before disclosure, while the nominee sees it only after owner consent.
The plan refreshes every ten seconds while viewing saved details, pauses during
edits or mutations, and preserves drafts on failures. Owner browser actions were
checked with managed authentication; collector actions used a synthetic trusted
service actor. Multi-account managed-auth browser verification remains pending.

### Studio review and issued offers

The organizer can request a published candidate from the group card. The
operator's `/studio` queue is owner-scoped and paginated. The exact review shows
the fixed roster, price, collection agreements, cancellation terms and buffered
calendar interval; four unchecked attestations gate the single approval. A
changed preference invalidates an open review. The issued `/offers/:id` view
shows the frozen terms and authoritative booking status, with no confirmation
while payments are incomplete. The group card links to that offer and reads its
status directly. [Studio setup](docs/studio-setup.md) is server-only and
idempotent; it never assigns the first signed-in user automatically.

The scoped [studio browser record](evidence/web/studio-flow.json) uses one managed
account as organizer and local test operator, with seeded synthetic peers. It
proves request, stale rejection, approval and one hold; it created zero payment
operations. Separate checkout and cancellation records below extend this evidence;
complete PayPal recovery, independent-account browser verification and deployment remain open.

### Participant checkout

`/offers/:id` now presents explicit agreement to the frozen session and automatic
settlement terms, then queues one participant-owned PayPal sandbox order. Return
and cancel URLs use the configured application origin. Returning from PayPal
never qualifies a buyer by itself: an explicit check queues server verification
of the stored order before authorization. The HTTP request cannot choose another
actor, order, buyer or amount. The worker retains payment execution and recovery.

The private payment view reads booking and participant operations in one database
snapshot, distinguishes authorization from collection, and reports unresolved,
refund and canceled states. Status refresh preserves the visible offer and pauses
checkout controls during explicit refresh. The roster remains visible on phones.

[Checkout evidence](evidence/web/checkout-flow.json) records actual managed-auth
owner acceptance, one real sandbox order and an early approval rejection with
zero authorizations/captures. Other group members and studio approval were seeded
synthetic fixtures. Buyer approval/return, distinct managed participant sessions,
and browser recovery are still required; this is not full checkout proof.

### Cancellation and another planning round

Participants can withdraw an OPEN offer with explicit acknowledgment that the
whole group offer closes. During settlement or after confirmation, they can
request studio cancellation; the request alone changes no payment or booking.
The studio can cancel an OPEN, SETTLING or CONFIRMED booking with explicit
agreement to full refunds. Cancellation immediately releases inventory and
queues the existing recovery worker. A capture or authorization already in
flight is retained, reconciled and refunded or voided; cancellation never
claims that recovery is already complete.

Only the organizer can reopen the latest closed offer after every prior attempt
is terminal with complete recovery and no unresolved financial operation.
Saved private details and the fixed roster remain available for review. A new
studio approval creates a separate immutable offer and needs fresh individual
acceptance. The old offer and its payment history stay unchanged. Studio booking
history is owner-scoped, paginated and exposes cancellation/reconciliation needs.

[Browser evidence](evidence/web/cancellation-flow.json) proves a synthetic offer
was canceled and reopened through the authenticated UI with zero payment
operations. PostgreSQL tests separately prove full refunds, duplicate protection,
private cancellation requests, pending-refund gating and late capture recovery
using a simulated provider. [Six isolated mutations](evidence/local-cancellation-mutations.json)
prove the new tests detect disabled recovery, unowned requests, premature
reopening, erased cancellation history and unbounded studio history. This does
not replace actual PayPal cancellation/refund browser proof.

Migration 008 adds the CANCELED terminal state and one private cancellation
request per participant. Its down migration refuses populated cancellation
history; use forward fixes after real use. The hosted private schema now has
ten migrations and retains the audited restricted runtime/browsers boundary.

### Consumer UI redesign

The user requested a Robinhood-inspired app. Rally now uses white surfaces, black sans-serif type, large prices and readiness values, lime primary actions, compact lists and thin dividers across the home, private intake, offer and studio screens. Prices and people come from the catalog or stored group data. Native disclosure controls keep rosters accessible without pushing mobile forms down the page. The local checks and screenshots are recorded in `evidence/web/redesign.json`; they establish visual and interaction verification, not complete payment or usability proof.

### Actual AI quality evaluation

The latest actual model run passed all 24 authored cases three times: 72/72 quality checks, zero safety failures, and useful clarification in all four ambiguity cases across every repeat. The independently authored structured baseline and per-candidate oracle check confirmed requirements and published facts. This is synthetic engineering evidence, not observed usability or an AI conversion claim. The original prompt failure and one timeout in the corrected prompt's first run remain in the report history.

Read `docs/ai-evaluation.md` for the protocol and `evidence/ai/evaluation-index.json` for every run. With the local app running, open `/evidence/ai/index.html` for the readable report. `npm run ai:evaluate` validates fixture baselines without model calls. Live runs require sufficient existing free credit or explicit spending authorization; there are no automatic model retries.


Shared public request quotas are stored in PostgreSQL and survive web-instance
restarts. Configure a stable private `RALLY_RATE_LIMIT_KEY` (32 random bytes in
hex) on every web instance, and apply migration `009_request_limits` before the
updated app. Health readiness checks both configuration and migration. Login
email, actor reads/writes, group creation and actual model dispatch have finite
quotas; raw emails and forwarded-IP headers never become quota identifiers.
The worker clears expired counters in bounded batches. See
[request quota policy and verification](docs/request-limits.md).

All 96 local tests pass, including independent connection concurrency and the
production model-budget wrapper with persistent owner checks. Twelve actual
local HTTP paths rejected exhausted capacity with `429` and `Retry-After`;
quota restoration preserved the existing signed-in experience. These controls
do not prove deployed traffic protection or isolated judge access, which remain
release gates. The ninth additive migration and restricted hosted-role/TLS audit
passed; Render remains undeployed.

The judge-workspace foundation adds finite, non-recycled 24-hour leases,
seven separately registered synthetic role identities per workspace, catalog
and group scope checks, and cross-workspace invite/command protection.
Eight PostgreSQL tests cover concurrent claims, expiry, scoped private reads,
independent studio approval and safe migration rollback. A deliberately disabled
scope guard failed two tests; the restored guard passed. See
[the bounded foundation evidence](evidence/judge-foundation.json).
Managed Auth account provisioning, cookie separation, role-switch UI, stale-tab
binding and the public judge journey remain unfinished. No judge endpoint is
enabled and these service tests are not browser or human-feedback proof.
