# Rally

[See the recorded six-friend booking](https://rally.gowthamsarveswaran.com/journey/index.html) · [Try live planning](https://rally.gowthamsarveswaran.com/demo) · [Inspect the evidence](evidence/README.md)

**A plan that fits everyone. Six holds. One booking.**

Rally helps friends book a private studio session without someone fronting the
group’s bill. Each friend sets their dates, spending limit and must-haves
privately. Optional AI drafting can turn a message into activity and pickup
choices or ask one grounded question. The friend checks and saves the choices;
a deterministic planner checks the group’s fit. Personal conflicts are explained
privately to the person who can resolve them.

The studio reserves the exact session and freezes the offer. Each person
authorizes their own PayPal share directly to the merchant. Rally starts
collecting only after every authorization qualifies, and confirms the booking
only after every capture is verified. The hosted six-friend run completed
**six separate $48 sandbox payments: $288 gross**.

## The question changes the plan

“I leave Friday.” Does that prevent attending, or just collecting the fired
piece? The first answer can leave no session; the second can allow Thursday’s
$48 hand-build session if a friend explicitly agrees to collect. The preview
uses the same confirmed-meaning transition and catalog filters as the saved
plan. It does not read peer preferences, invent consent or reserve a session.

Unlike collecting money into an organizer’s pool, each person’s share goes to
the merchant through its own authorization and capture. Nobody backstops another
friend’s share. These are separate payments: if settlement fails, completed
captures require refunds and remaining authorizations require voids. Uncertain
results remain visible until verified; they never count as a confirmed booking.

## Choose how far to try it

1. **Recorded journey — no code or account.** [Twelve actual hosted screens](public/journey/index.html), dated October 3, with settlement and webhook reports. Fictional group, fictional studio, PayPal sandbox. Screens show the interface at that date.
2. **Live planning — private access code.** [/demo](https://rally.gowthamsarveswaran.com/demo) lets you add Alex’s and Sam’s details, clarify a note, agree collection and obtain a studio offer. Stop there; PayPal sign-in is optional for this layer.
3. **Live checkout — six distinct sandbox buyers.** Continue from the offer and approve each person’s share. The server verifies the expected payer and order; returning from PayPal is not proof of approval.

The Free preview may take about a minute to wake. Live entry claims an isolated,
non-recycled workspace; return using the same browser session. Newly claimed
judge sessions end December 16 at 00:00 UTC. [Capacity and provisioning](docs/judge-provisioning.md).

## Verified scope

<!-- BEGIN CURRENT TRUTH -->
Verified 2026-10-29. Historical provider and AI runs retain their own dates.

| Claim | Result | Scope |
| --- | --- | --- |
| Hosted group booking | 6 buyers · 6 × $48 · $288 gross | Actual hosted PayPal sandbox, 3 Oct |
| Signed notifications | 12 processed; delivered duplicate unchanged | Hosted 3 Oct; duplicate response body not captured |
| Failure compensation | Refund + remaining voids; lost-response recovery | Separate local service with 3 real sandbox buyers |
| AI evaluation | 72/72 final quality assessments; 0 safety failures | 24 authored cases × 3; earlier failures retained, 2 Oct |
| Optional draft AI | 5/5 final hosted checks; earlier 2/5 retained | Five new authored fictional cases; 10 approved calls total, 29 Oct |
| Local suite | 224 passed; 0 failed | Disposable PostgreSQL; controlled Auth/model/provider, 29 Oct |
| Guard mutations | 63/63 caught | Existing protections plus private conflict explanation, 29 Oct |
| TypeScript / production build | Passed | 29 Oct; Node 25.6.0 locally |
| Judge capacity | 9 untouched of 12 total workspaces | Read-only checks, 29 Oct; no new identities or leases |
| Hosted active failure recovery | Unverified | The hosted six-buyer success is separate |
| Human groups / studios observed | 0 / 0 | Capacity-hold demand remains unvalidated |
| Free email sign-in | Resend Delivered; owner confirmed sign-in | One external-to-team recipient, same Chrome browser; phones unverified, 27 Oct |
| Plan interface | Form first; private blockers and explicit friend decisions | Controlled phone flows plus 12 public/access checks, 29 Oct; human usability unmeasured |
| Production dependency audit | 0 advisories | Next 16.4.3, Zod 4.6.7; checked 28 Oct |
<!-- END CURRENT TRUTH -->

[The evidence index](evidence/README.md) leads to the hosted six-buyer result,
signed webhooks, separate three-buyer compensation proof, AI evaluation and
dated local checks. Historical counts in archived reports describe those
revisions. Validation gaps are stated once in
[What remains untested](evidence/README.md#what-remains-untested).

## Test without external accounts

Use Node.js 22+, npm, Docker and OpenSSL. No `.env`, Supabase project, AI key or
PayPal account is needed for the suite. The test provider, model and Auth
responses are controlled fixtures. Each database test creates and removes its
own schema; it does not truncate application tables.

```sh
npm ci
docker run --detach --name rally-test-postgres --publish 127.0.0.1:55439:5432 \
  --env POSTGRES_USER=rally --env POSTGRES_PASSWORD=rally_local_only \
  --env POSTGRES_DB=rally postgres:17-alpine
TEST_DATABASE_URL=postgresql://rally:rally_local_only@127.0.0.1:55439/rally npm test
npm run typecheck
npm run build
```

If this test container exists, start it with `docker start rally-test-postgres`.
The database needs schema creation privileges. Use these credentials only for
the local test container. Optional deliberate guard checks, run **after** the
suite and without concurrent source edits:

```sh
TEST_DATABASE_URL=postgresql://rally:rally_local_only@127.0.0.1:55439/rally npm run test:mutations
```

The October 27 verification used Node 25.6.0. The declared minimum Node version
has not been independently tested.

## Run the app

The app uses the existing Supabase Auth project for PKCE email-link login.
The hosted project uses Resend Free custom SMTP from the verified
`mail.rally.gowthamsarveswaran.com` subdomain. Email confirmation and the
same-browser magic-link flow remain enabled. Delivery verification is recorded
in [the SMTP setup notes](docs/free-smtp-2026-10-27.md). The prepared judge path
uses separate managed identities. Copy
`.env.example` to `.env.local` without overwriting an existing configuration.
Set a local application database, `APP_ORIGIN=http://localhost:3000`, the
Supabase URL/client-safe publishable key and a stable private rate-limit key.
Allow exactly `http://localhost:3000/auth/callback` in Auth. Keep secrets in
ignored configuration, never in source or chat.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
npm run dev
npm run worker
```

Run the worker in another terminal. The app is at `http://localhost:3000`.
Configure only PayPal **sandbox** credentials for checkout. The adapter has a
fixed sandbox origin; AI has no payment authority. [Studio setup](docs/studio-setup.md),
[sandbox success/recovery report](evidence/paypal-sandbox/index.html),
[AI protocol](docs/ai-evaluation.md), [private-text retention](docs/private-text-retention.md).

## Implementation

- **Private by actor:** the organizer sees names/readiness and shared candidates, never peer budgets or notes. AI receives only a consenting owner’s note and public studio facts.
- **Exact offers:** studio approval reserves buffered resource capacity and freezes roster, catalog, price and cancellation terms. Preference edits invalidate a draft; issued offers cannot be rewritten.
- **Verified payments:** expected payer checks, stable request IDs, durable operation leases, provider reconciliation, compensation and signed webhook deduplication. A failed fifth capture cannot produce a confirmed booking.
- **One Free deployment:** Next.js on the existing Render Free service; PostgreSQL/Auth and private scheduled settlement on the existing Supabase Free project. [Deployment](docs/deployment.md), [database](docs/hosted-database.md), [webhooks](docs/paypal-webhooks.md).

The sole repository is `gowtham0992/rally`, under the [MIT license](LICENSE).
It remains private until the owner chooses to publish. Video and Devpost
submission are owner-controlled final-week work.

[October 27 usability changes](docs/usability-implementation-2026-10-27.md) ·
[Corrected uncoached study](docs/uncoached-study-2026-10-27.md).
