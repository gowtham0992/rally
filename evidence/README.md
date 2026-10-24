# Rally evidence

Start with the recorded booking. The eight entries below distinguish actual
PayPal operations, controlled local checks and authored AI evaluations.

| Proof | What to inspect |
| --- | --- |
| 1. [Recorded six-friend journey](../public/journey/index.html) | Twelve reviewed screenshots of the actual October 3 hosted flow, with captions and provenance. [Hosted reader](https://rally.gowthamsarveswaran.com/journey/index.html) requires no code or account. |
| 2. [Six-buyer settlement](web/hosted-six-friend-settlement.json) | Six distinct sandbox buyers, six $48 captures, $288 gross, all authorizations before capture and all captures before confirmation. Provider GETs independently checked each resource. |
| 3. [Delivered duplicate webhook](web/hosted-webhook-retransmission.json) | Twelve genuine signed notifications processed; the actual delivered resend received HTTP 200 and left the original receipt and financial state unchanged. The duplicate JSON response body was not captured. |
| 4. [Hosted forged-signature denial](hosted-webhook-signature-denial.json) | A forged notification was rejected using a real PayPal public certificate, without changing payment records. |
| 5. [Three-buyer recovery report](paypal-sandbox/index.html) | Separate local-service runs with real PayPal sandbox operations: $144 success, partial failure refunded $48 and voided the remaining holds, and a lost capture response recovered after restart without another capture. This is not hosted failure-recovery proof. |
| 6. [Actual-model evaluation](../public/evidence/ai/index.html) | 24 authored cases × 3 repeats; final 72/72 quality assessments, zero safety failures, independent structured baseline and constraint oracle. Two earlier failed runs remain accessible. [Machine-readable index](ai/evaluation-index.json). |
| 7. [Current verification record](current-verification.json) | Dated suite, build, privacy, browser and capacity checks for the current implementation. Historical test counts belong to their original revisions. |
| 8. [Release archive](releases/README.md) | Earlier per-release checks, screenshots and their exact test boundaries. They support the implementation history; they do not represent human usability observations. |

## Run the checks without external accounts

The automated suite uses a local PostgreSQL database, OpenSSL and controlled
Auth/model/payment fixtures. It does not require Supabase, PayPal or Astropods
credentials, and it does not send email or create real payments. Follow the
[local test path](../README.md#test-without-external-accounts).

## Current truth

<!-- BEGIN CURRENT TRUTH -->
Verified 2026-10-23. Historical provider and AI runs retain their own dates.

| Claim | Result | Scope |
| --- | --- | --- |
| Hosted group booking | 6 buyers · 6 × $48 · $288 gross | Actual hosted PayPal sandbox, 3 Oct |
| Signed notifications | 12 processed; delivered duplicate unchanged | Hosted 3 Oct; duplicate response body not captured |
| Failure compensation | Refund + remaining voids; lost-response recovery | Separate local service with 3 real sandbox buyers |
| AI evaluation | 72/72 final quality assessments; 0 safety failures | 24 authored cases × 3; earlier failures retained, 2 Oct |
| Local suite | 186 passed; 0 failed | Disposable PostgreSQL; controlled Auth/model/provider, 23 Oct |
| Guard mutations | 62/62 caught | Existing checks rerun on 23 Oct; review’s 40 count was stale |
| TypeScript / production build | Passed | 23 Oct; Node 25.6.0 |
| Judge capacity | 10 untouched of 12 total workspaces | 49 approved new fictional Auth accounts; no emails or payments, 23 Oct |
| Hosted active failure recovery | Unverified | The hosted six-buyer success is separate |
| Human groups / studios observed | 0 / 0 | Capacity-hold demand remains unvalidated |
<!-- END CURRENT TRUTH -->

## What remains untested

Human validation and willingness to hold studio capacity remain open, as
recorded in the truth table. Hosted partial-failure recovery and a fresh
managed-auth browser rehearsal through studio approval are separate gates.
These are fictional-account engineering results.
