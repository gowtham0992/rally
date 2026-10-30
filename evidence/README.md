# Verification

These records distinguish actual PayPal sandbox operations, controlled local
checks, authored model evaluations and observations by people. The current
release has a fictional studio; none of these records establishes real merchant
demand. Start with the [product documentation](../docs/README.md) to use or run Rally.

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
[local test path](../docs/development.md#test-without-external-accounts).

## Current verification

<!-- BEGIN CURRENT TRUTH -->
Verified 2026-10-29. Historical provider and AI runs retain their own dates.

| Claim | Result | Scope |
| --- | --- | --- |
| Hosted group booking | 6 buyers · 6 × $48 · $288 gross | Actual hosted PayPal sandbox, 3 Oct |
| Signed notifications | 12 processed; delivered duplicate unchanged | Hosted 3 Oct; duplicate response body not captured |
| Failure compensation | Refund + remaining voids; lost-response recovery | Separate local service with 3 real sandbox buyers |
| AI evaluation | 72/72 final quality assessments; 0 safety failures | 24 authored cases × 3; earlier failures retained, 2 Oct |
| Optional draft AI | 5/5 final hosted checks; earlier 2/5 retained | Five new authored fictional cases; 10 approved calls total, 29 Oct |
| Local suite | 232 passed; 0 failed | Disposable PostgreSQL 17 in UTC; controlled providers; includes two public-docs boundary tests, 29 Oct |
| Guard mutations | 68/68 caught | 68/68 from the correction release, unchanged by docs; two additional docs boundary mutations caught separately, 29 Oct |
| TypeScript / production build | Passed | 29 Oct; Node 25.6.0 locally |
| Judge capacity | 9 untouched of 12 total workspaces | Read-only checks, 29 Oct; no new identities or leases |
| Hosted active failure recovery | Unverified | The hosted six-buyer success is separate |
| Human groups / studios observed | 0 / 0 | Capacity-hold demand remains unvalidated |
| Free email sign-in | Recorded desktop delivery; owner reports phone sign-in and saved details | Desktop delivery, 27 Oct; one developer phone report, 29 Oct; device/browser details and independent phone flows unverified |
| Plan interface | Scoped consent; persistent opt-outs; clear closed offers | Controlled components/services and phone screens; 12 public/access checks, 29 Oct; human usability unmeasured |
| Production dependency audit | 0 advisories | Production dependencies including react-markdown 10.1.0 and remark-gfm 4.0.1; checked 29 Oct |
| Public guides | 7 guides; 19 guide/path checks passed | Live public routes only; no internal document or private-file exposure, 29 Oct |
<!-- END CURRENT TRUTH -->

## What remains untested

Independent friend-group usability and studio willingness to hold capacity
remain unmeasured. The owner reported one successful phone sign-in and saving
details; the device, browser and chat/email transitions were not recorded. This
is not an independent participant trial or a six-person phone checkout.

Hosted partial-failure recovery remains unverified. The October 3 hosted
six-buyer success and separate local-service recovery runs have different
scopes. The recorded journey shows the October 3 interface. Controlled local
phone screens and role switching do not establish independent comprehension.
