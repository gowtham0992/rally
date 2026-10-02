# Rally

Rally helps a group agree on a studio experience privately, then book with each person paying their own share through PayPal.

The current implementation covers the durable payment engine and shared planning rules. There is no participant web application yet. Local PostgreSQL tests exercise group settlement and recovery with a simulated provider; an actual PayPal sandbox run is still required. Synthetic offers are not real studio availability.

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

The following procedure is implemented but has **not yet been executed against PayPal**. Do not run the background worker during these fault scenarios: the command runner supplies the deliberate pause between captures.

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

The model boundary accepts only finite interpretations with matching source text and revisions. It cannot accept payment actions or invented offering identities. A model endpoint, automatic question selection and its two-question limit, managed authentication, and persistent private intake are not implemented yet. The local planning checks are not the required 24-case model evaluation and establish no AI superiority.

The [build contract](build-contract.json) retains the full product scope. Remaining gates include the actual sandbox lifecycle, managed participant authentication, private planning and model evaluation, the merchant and mobile participant experience, deployment, observed usability and merchant validation, and submission materials. None is implied complete by green local payment tests.

Code is licensed under MIT. Dependencies retain their respective licenses.
