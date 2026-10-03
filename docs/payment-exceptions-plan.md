# Studio payment resolution

A studio must be able to find unresolved payment work, see the amount whose outcome still needs verification, and request a check of the existing provider operation. The implemented `/m/exceptions` page and `/api/studio/exceptions` API provide this view; the booking list links cases needing studio attention. Local production-build verification is recorded in `evidence/web/payment-resolution.json`. The existing Free preview now serves the page; studio ownership and participant denial passed through the hosted browser. The compatible rollback/restoration preserved the successful booking. Manual evidence capture and hosted financial failure scenarios remain separate gates.

## Boundaries

A signed-in participant can submit an arbitrary offer or operation ID. The server must enforce studio ownership, verified identity and the existing demo-workspace boundary for every read and command. Follow `BookingService.merchantBookings` and `BookingService.command`; keep bounded cursor pagination and the existing Origin, body and request-quota checks.

Expose booking terms and payment-operation summaries, not budgets, private notes, payer emails, approval URLs, tokens or raw provider responses. A confirmed booking and an unfinished refund must remain independent facts.

## Smallest complete slice

- Add the studio resolution page at `/m/exceptions`, linked from `/studio` and from bookings needing attention.
- Read actual operations for studio-owned offers. Include unknown/action-required outcomes and rejected refunds or voids; distinguish normal processing from a case requiring attention.
- Derive totals once per member. Label captured amounts awaiting a verified refund separately from uncertain capture amounts and outstanding authorizations. Do not sum authorization and capture amounts as separate charges. A pending refund may already have completed at PayPal; the label must reflect missing verification.
- Offer “Check payment status” only for an existing operation whose next worker attempt is guaranteed to be read-only: pending operations, or previously dispatched uncertain operations with no remaining replay window. Preserve operation ID, request ID, payload, first-dispatch time, retry deadline, result and lease fencing. Bring its next check forward without inserting a payment operation or declaring an outcome.
- A definitive rejected refund cannot safely be relabeled pending to make the button work. Show its known outcome and the need to investigate PayPal records. Manual evidence must never override confirmation or manufacture financial success.
- Keep reconciliation on the existing scheduled worker. The UI reports a requested check and refreshes authoritative state; it does not promise a refund or completed cleanup.

## Verification gates

Use isolated local PostgreSQL fixtures and the simulated provider for ownership, workspace isolation, pagination, safe amount projection, concurrent duplicate commands, active leases, expired retention and stable operation identity. Assert zero provider POSTs when requesting/checking an uncertain existing operation. Observe the unauthorized test failing with its ownership guard deliberately weakened, then restore the guard.

Exercise actual UI loading, empty, failed fetch/retry, expired identity, repeated clicks and a case resolved in another tab. Keep the successful hosted six-friend booking untouched; hosted failure proof belongs to a separate explicitly labeled sandbox scenario.

Raw-text retention is a separate contract gap: redact all private text copies thirty days after planning closes while preserving confirmed structured facts and payment audit history. Implementation must inspect clarification source spans and persisted command results as well as `preference_revisions.optional_text`.

## Implemented behavior

The list is bounded to twenty studio-owned cases, ordered by opened time and offer ID. An owned cursor remains valid after its case resolves. A check command locks the owned offer and existing operation, rejects an active worker lease or remaining replay window, and only advances `next_check_at`. Its command ID provides one audit event for duplicate submissions. Scheduled processing remains authoritative.

Studios can expand payment references to inspect the current operation and its original capture or authorization from the same member. These references aid investigation; they do not declare a verified financial outcome. Rejected refunds retain their status and have no replay action. Private notes, budgets, emails, payer IDs, request IDs and provider payloads are excluded.

All 130 local tests pass, including six new payment-resolution cases; all 25 deliberate guard mutations were caught. Actual local production UI showed empty, loading, populated, requested-check, failure and recovered states, keyboard refresh, narrow layouts and an uncertain case removed after simulated provider GET verification with zero provider POSTs. These fixtures are explicitly labeled local payment simulation. A manual evidence workflow, actual expired-session navigation on this new page and hosted financial recovery proof remain unfinished. See `evidence/web/payment-resolution-release.json` for deployment, role access and compatible rollback/restoration evidence.
