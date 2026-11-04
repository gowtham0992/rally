# Verification

The [4 November application checkpoint](studio-question-recovery-2026-11-04.json)
records **274 passing local tests**, **93/93 caught mutation guards**, typecheck,
production build and worker build. These checks use disposable PostgreSQL and
controlled providers. They do not establish real studio demand or independent
friend-group usability.

Start with the [2:45 video](https://youtu.be/5PE5RJzngpA), recorded on 1 November,
for the newer interface and a separate six-buyer sandbox booking. Then use the
records below to inspect the implementation and its verification boundaries.
[Product documentation](../docs/README.md) explains how to use or run Rally.

| Evidence | Recorded result | Scope |
| --- | --- | --- |
| [4 November release checks](studio-question-recovery-2026-11-04.json) | 274 tests, 93 mutation guards, builds and an actual browser-reload check. | Local PostgreSQL 18; controlled identities and providers. |
| [Six-buyer settlement](web/hosted-six-friend-settlement.json) | Six separate $48 captures, $288 gross; authorizations before collection and captures before confirmation. | Actual hosted PayPal sandbox, 3 October; provider GETs checked the resources. |
| [Studio-question AI](studio-question-evaluation-1793761616523.json) | Corrective six-case run; initial and parser-only failures remain recorded below. | Authored regression cases, 3 November; one prompt-guidance example, not held out. |
| [Three-buyer recovery](paypal-sandbox/index.html) | Partial-failure refund and remaining voids; recovery after a lost capture response. | Separate local service with actual sandbox buyers; hosted active failure recovery unverified. |
| [Delivered duplicate webhook](web/hosted-webhook-retransmission.json) | Twelve signed notifications processed; an actual resend left financial state unchanged. | Hosted 3 October run; duplicate response body not captured. |
| [Forged-signature denial](hosted-webhook-signature-denial.json) | Forged notification rejected without changing payment records. | Hosted receiver with a real PayPal public certificate. |
| [Earlier clarification evaluation](../public/evidence/ai/index.html) | 24 authored cases × 3 repeats; final 72/72 assessments, earlier failures retained. | Different October contract; not a current general reliability rate. [Source index](ai/evaluation-index.json). |
| [Earlier hosted journey](../public/journey/index.html) | Twelve actual October screenshots with captions and provenance. | Earlier interface; [hosted reader](https://rally.gowthamsarveswaran.com/journey/index.html). |

The [29 October verification record](current-verification.json) and
[release archive](releases/README.md) retain dated earlier checkpoints. Counts
and screenshots describe their original releases.

## Run the checks without external accounts

The automated suite uses a local PostgreSQL database, OpenSSL and controlled
Auth/model/payment fixtures. It does not require Supabase, PayPal or Astropods
credentials, and it does not send email or create real payments. Follow the
[local test path](../docs/development.md#test-without-external-accounts).

## Studio-question recovery follow-up · 4 November

The [three-issue correction](studio-question-recovery-2026-11-04.json) records
**274 passing local tests** and **93/93 caught mutation guards**. Three new
regressions failed against the preceding release: ordinary accessibility wording
was rejected, a studio request errored after answer expiry, and fresh command IDs
duplicated a pending draft. All three now pass, alongside identity, consent,
expiry, quota and payment guards.

The actual question and studio-request components were checked at 375×812 using
disposable PostgreSQL and a simulated model. An actual browser reload retained
one model dispatch and one quota unit, then recovered the original result. This
is controlled local evidence, not a hosted authenticated or independent-user
trial. No new external model calls, emails, accounts or PayPal operations were
needed. The existing worker contract and deployment remain unchanged.

## Four studio-question corrections · 3 November

The [four-issue verification](studio-question-four-fixes-2026-11-03.json)
records **268 passing local tests**, **88/88 caught mutation guards**, typecheck,
the production build and worker bundle. It covers owner-only session mismatch
guidance, database-authoritative question/answer expiry, ordinary grammatical
modal words versus actual name references, and distinct AI unavailable/review
results through the worker, saved draft and interface.

Phone-width rehearsals used the actual components and disposable PostgreSQL 18
with simulated identity/model boundaries. They preserved typed text, required
fresh review after expiry and kept manual sharing consent explicit. This is
controlled integration evidence, not independent human or hosted Auth proof.
The exact packaged worker image passed seven controlled HTTPS-gateway and
authentication checks. The correction uses no new real model calls or PayPal
operations.

## Studio reply outcomes · 3 November

The [minimal reply correction](studio-reply-outcomes-2026-11-03.json) removes the
unusable new “Needs discussion” outcome from both the studio form and server
validation. Historical discussion replies stay readable and unresolved. New
questions explicitly say the studio sees them only when it next opens Rally;
there is no offline notification. Manual and AI-drafted questions share the same
application privacy checks.

The full suite passed **256 tests under Node 22.23.4**, **79/79 mutation guards**,
typecheck and a production build with disposable PostgreSQL 18. No migration,
model call, email, account, hosted workspace claim or PayPal operation was needed.
This is a minimal correction, not independent usability evidence.

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

The [activation receipt](studio-question-deployment-2026-11-03.json) records the
enabled hosted preview, one real fictional request through the deployed worker,
and **12/12 public/access-denial checks**. The six-case evaluation and that single
worker request have separate scopes. No new authenticated hosted group flow,
independent people, emails or PayPal operations were exercised.

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

## Historical release verification

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
