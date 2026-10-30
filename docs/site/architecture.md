Rally separates private planning, optional interpretation, studio approval and
financial settlement. PostgreSQL stores the state needed to survive retries and
process restarts.

## Four boundaries

| Layer | Responsibility |
| --- | --- |
| Next.js and React | Role-specific screens and authenticated server commands. |
| PostgreSQL and Supabase Auth | Durable state, verified identity and private projections. |
| Astropods inference worker | Bounded interpretation with no database or payment credentials. |
| PayPal sandbox adapter | Orders, authorizations, captures, refunds, voids and reconciliation. |

The existing Render deployment hosts the app. Scheduled processing advances
payment work; a separate maintenance job expires private text. The documentation
pages are static public content and do not need an account or model request.

## Private planning, shared fit

Each person owns immutable preference revisions. The planner checks confirmed
activity, price, availability, end time, capacity and pickup requirements against
the published catalog. It never relaxes a requirement to manufacture a match.

The same next-step resolver serves the plan page and plan list. Names and
readiness can be shared while underlying answers stay private. Pickup consent
binds the two people to a particular preference revision. Attendance opt-outs
persist across subsequent offers until the same person returns.

## Offers are immutable commitments

The studio confirms delivery, calendar blocking, pickup arrangements and
automatic settlement. Approval reserves the buffered resource interval and
freezes the roster, session, price and terms.

The server verifies the complete offer snapshot before projecting it. Friends
receive only pickup arrangements involving them; the studio retains the full
arrangement view. Payment acceptance binds to the original server snapshot,
not a client-authored price or roster.

## Durable operations, verified outcomes

Stable operation IDs, request fingerprints, database locks and dispatch leases
protect retries and late responses. The payment adapter checks payer identity,
amount, currency and provider resource relationships.

A signed webhook can attach a provider resource to an existing operation, but
cannot declare the booking successful. Provider checks remain authoritative.
Confirmation requires every required capture to be verified. Separate payments
need compensation after partial failure; uncertainty remains visible.

## Inference stays outside authority

The AI worker authenticates requests before dispatch and returns a closed
interpretation schema. It has no database or PayPal credentials. Rally checks
ownership, source freshness, quotas and explicit confirmation before applying
any proposed meaning.

No model output can create a pickup agreement, studio reservation or financial
operation. [How AI helps](/docs/ai) describes that user-facing boundary.
