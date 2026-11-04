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

## Studio-question AI correction · 3 November

The [diagnosis and correction](studio-question-fix-2026-11-03.json) records a
reproduced JSON-fence parser bug, an overbroad prompt interpretation and an
evaluator that counted processing failures as safe abstentions. The fix accepts
only complete JSON fences, keeps literal evidence/privacy checks, and separates
actual model review from provider/parser errors.

The [corrective six-case run](studio-question-evaluation-1793761616523.json)
produced usable drafts for three straightforward needs, preserved the full
conditional need, and explicitly declined the unrelated/hostile cases. All six
passed. These are authored regression cases, not a held-out or independent
usability study. The parser-only failed run and initial failed run remain recorded.
The local suite passed **254 tests**, **78/78 mutation guards**, typecheck, app
build and worker bundle. No payment or intake-consent logic changed in this fix.

## Private studio-question release · 3 November

The [private-question verification](studio-question-release-2026-11-03.json)
records **250 passing local tests**, **76/76 caught mutation guards**, passing
typecheck and both builds. Its database was disposable PostgreSQL **18** in UTC;
this is separate from the PostgreSQL 17 source audit below. Empty migration
up/down/up passed; removing populated question history was refused.

The actual friend and studio components were rehearsed at desktop and phone
width with local PostgreSQL and simulated identity/model boundaries. A friend
sent a question, read the studio's exact reply and explicitly accepted its
conditions; the organizer then saw everyone ready without seeing the exchange.
This is local integration evidence, not independent people or hosted Auth proof.

The [six actual question-draft checks](studio-question-evaluation-1793758872372.json)
produced no usable question on the three straightforward needs. All six
application checks ended in review. That initial release kept the question-draft helper disabled;
the correction and its release gate are recorded above. Existing activity/pickup AI
is unchanged. The failed checks remain recorded rather than presented as a
larger passing reliability rate.

## Repository verification

The [2 November source verification](repository-readiness-2026-11-02.json)
installed the lockfile in a clean tracked-source checkout without private
environment files. All **234 tests passed**, as did typechecking, the production
build and the standalone AI-worker build. All sixteen migrations applied to
disposable PostgreSQL 17 and passed an idempotent rerun. Eleven local production
HTTP checks and four worker authentication/input checks passed with fixture-only
configuration. The production dependency audit found zero advisories.

Source and history secret scans found no credentials. On-device OCR of 130
unique current and historical images found no recognized secrets or nonexample
email addresses; OCR is not a guarantee that every pixel was interpreted.
Raw logs remain private. These source checks made no live model calls, payments,
emails or hosted changes and do not replace the dated provider evidence below.

The [2:45 demo](https://youtu.be/5PE5RJzngpA) records the newer interface and a
separate six-buyer sandbox booking. The October journey and provider reports
above preserve their original dates and scopes.

## Recorded release verification

<!-- BEGIN CURRENT TRUTH -->
Verified 2026-10-29. Historical provider and AI runs retain their own dates.

| Claim | Result | Scope |
| --- | --- | --- |
| Hosted group booking | 6 buyers · 6 × $48 · $288 gross | Actual hosted PayPal sandbox, 3 Oct |
| Signed notifications | 12 processed; delivered duplicate unchanged | Hosted 3 Oct; duplicate response body not captured |
| Failure compensation | Refund + remaining voids; lost-response recovery | Separate local service with 3 real sandbox buyers |
| AI evaluation | 72/72 final quality assessments; 0 safety failures | 24 authored cases × 3; earlier failures retained, 2 Oct |
| Optional draft AI | 5/5 final hosted checks; earlier 2/5 retained | Five new authored fictional cases; 10 approved calls total, 29 Oct |
| Historical suite · 29 Oct release | 232 passed; 0 failed | Historical checkpoint: disposable PostgreSQL 17 in UTC; controlled providers. See the 2 Nov source record for 234 passing tests. |
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
