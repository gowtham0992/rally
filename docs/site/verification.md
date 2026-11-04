The 4 November application checkpoint passed **274 local tests** and **93/93
mutation guards**, plus typecheck, production-build and AI-worker-build checks.
The records below distinguish implementation checks, actual PayPal sandbox
operations, authored model evaluations and observations by people.

## Current implementation checks

The latest suite ran on Node 22.23.4 and disposable PostgreSQL 18 in UTC, with
controlled identity, model and payment providers. It covers privacy, explicit
consent, exact session binding, expiry, payment verification and recovery.

A phone-width rehearsal at 375×812 used the actual question and studio-request
components. Ordinary accessibility questions were sent unchanged, identifying
wording stayed blocked, and an expired studio request displayed a stale notice.
An actual browser reload during a controlled draft reused one attempt and one
quota unit, then recovered its original result with sharing consent unticked.

These are local integration checks. They did not use hosted sign-in, call a real
model or payment provider, or observe independent friends. Public health and
access-denial checks establish availability and access boundaries at that moment;
they do not establish a completed group booking.

## Recorded PayPal sandbox payments

The 2:45 video was recorded on 1 November and shows a separate six-buyer sandbox
booking in the newer interface. It is linked from the repository README and
prepared demo entry.

The more detailed 3 October hosted record contains **six distinct sandbox
buyers, six $48 captures and $288 gross**. All required authorizations preceded
collection, and all captures were verified before booking confirmation. Twelve
signed provider notifications were processed. A delivered duplicate left the
recorded financial state unchanged.

The [recorded journey](/journey/index.html) preserves the actual October
interface, captions and provenance. Those fictional identities are not a group
of independent customers. Its provider records and the November video retain
separate dates and scopes.

## Recovery checks have a separate scope

Separate local-service runs used three real PayPal sandbox buyers to exercise
partial-failure refunds and remaining voids, plus recovery from a lost capture
response. Those results are distinct from the hosted six-person success.
Hosted active partial-failure recovery remains unverified.

## Model checks retain earlier failures

The 3 November studio-question correction passed six authored regression cases:
three straightforward needs produced usable drafts, a conditional need retained
its complete alternative, and unrelated or hostile messages received explicit
review results. One example also appeared in prompt guidance; this was not a
held-out evaluation.

The initial six checks and a parser-only attempt remain recorded. The parser
had rejected complete JSON code fences, and the prompt had discouraged quoting
access or materials needs. The corrective run fixed both issues and stopped
counting processing failures as successful model abstention. One subsequent
fictional request through the deployed worker produced a valid question draft.
That inference is separate from the later controlled worker-protocol checks.

Earlier results cover different contracts: five optional-message cases passed
after an initial 2-of-5 run; a separate eight-case draft checkpoint retained its
earlier failure; and the original clarification suite repeated 24 authored cases
three times. These results must not be combined into a current reliability rate.
The [clarification report](/evidence/ai/index.html) preserves its cases, method
and earlier failed runs.

## What remains unmeasured

No independently observed friend-group trials or real studio observations have
been recorded. Studio willingness to hold capacity, use of the optional AI
helper and uncoached group usability remain unmeasured.

The owner reported successfully signing in and saving details on a phone. The
device, browser and chat/email transitions were not recorded. That report does
not establish a six-person phone checkout or independent-user comprehension.

The current release uses a fictional studio and PayPal sandbox. It does not take
live payments, reserve actual studio capacity or establish production readiness.
