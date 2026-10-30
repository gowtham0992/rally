# Studio payment resolution

> Historical record. This document describes its original checkpoint or proposed
> study, not current product instructions. Start with the [documentation](README.md)
> or [development history](history.md) for context.

A studio must be able to find unresolved payment work, see the amount whose outcome still needs verification, and request a check of the existing provider operation. The implemented `/m/exceptions` page and `/api/studio/exceptions` API provide this view; the booking list links cases needing studio attention. Local production-build verification is recorded in `evidence/web/payment-resolution.json`. The existing Free preview now serves the page; studio ownership and participant denial passed through the hosted browser. The compatible rollback/restoration preserved the successful booking. Manual evidence capture is implemented; hosted financial failure scenarios remain a separate gate.

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

[Raw-text retention](private-text-retention.md) now clears private notes and model quotations thirty days after planning ends while preserving confirmed structured facts and payment audit history. Native hosted cleanup has removed an isolated fictional note/quotation; command results were audited for copied text. Studio report records now address the manual-evidence requirement.

## Implemented behavior

The list is bounded to twenty studio-owned cases, ordered by opened time and offer ID. An owned cursor remains valid after its case resolves. A check command locks the owned offer and existing operation, rejects an active worker lease or remaining replay window, and only advances `next_check_at`. Its command ID provides one audit event for duplicate submissions. Scheduled processing remains authoritative.

Studios can expand payment references to inspect the current operation and its original capture or authorization from the same member. These references aid investigation; they do not declare a verified financial outcome. Rejected refunds retain their status and have no replay action. Private notes, budgets, emails, payer IDs, request IDs and provider payloads are excluded.

All 130 local tests pass, including six new payment-resolution cases; all 25 deliberate guard mutations were caught. Actual local production UI showed empty, loading, populated, requested-check, failure and recovered states, keyboard refresh, narrow layouts and an uncertain case removed after simulated provider GET verification with zero provider POSTs. These fixtures are explicitly labeled local payment simulation. Actual expired-session navigation on this page and hosted financial recovery proof remain unfinished. See `evidence/web/payment-resolution-release.json` for deployment, role access and compatible rollback/restoration evidence.

## Studio reports

`/m/payments/[operationId]` shows the current operation result, provider references and the studio’s earlier reports before its entry form. The owner can append a transaction or support-case reference and an observed outcome for a dispatched unresolved operation or a rejected refund/release. “Reported completed” remains labeled “Studio report · Unverified”; it never counts as a completed charge, refund or booking.

The same ownership/workspace, verified identity, Origin, bounded body and shared request quotas protect the read and write API. It accepts no free note, attachment, amount, actor override or payment-state override. References are normalized, limited to 3–64 ASCII letters/numbers/hyphens, and outcomes use four explicit values. Each operation permits fifty reports, displayed twenty at a time with an owned stable cursor.

The command locks the owned offer before the existing operation, fences a changed state, and records one metadata-only event. A repeated command survives a new service instance; a fresh command repeating the same reference and outcome also returns the existing report. The evidence row is linked to the committed intake command with a deferred foreign key. UPDATE/DELETE are forbidden by its immutable trigger; the hosted runtime has only SELECT/INSERT privileges. Runtime rollback keeps this additive schema and any report history. Its down migration refuses populated evidence.

Nine additional PostgreSQL tests and nine caught mutations cover financial truth, active leases, idempotency, ownership/workspaces, strict input, stale/resolved operations, rejected refunds, equal-timestamp pagination, the record cap and immutable command linkage. The 151-test full suite and all forty mutation checks passed. Actual authenticated local UI saved a fictional “completed” report on a simulated pending refund: one report and one audit event were added; payment operations, offers and reservations were unchanged. Refresh preserved a draft; an actual stale save was rejected; a failed connection retained the draft and history and recovered through retry. At 374 CSS pixels the page had no horizontal overflow. This is local simulated-provider evidence, not a hosted PayPal failure or an independently verified support case.

The feature is now live on the existing Free preview as `6eccc29`. Hosted
studio read and participant denial passed on an existing completed sandbox
payment; no report form was offered for it. Forward, compatible rollback and
restoration retained migration 013 and preserved protected history. No hosted
report was written and no active financial recovery was involved.
