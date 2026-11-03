# Payments and privacy

Rally keeps a person's private planning answers separate from the shared booking
and from their payment records. Each payment goes to the studio's PayPal merchant
account: a single configured sandbox merchant in this demo. The organizer does
not collect a group balance.

## A hold is different from a completed charge

| Status | Meaning |
| --- | --- |
| Approval needed | You still need to agree to the offer and approve your share. |
| Authorized | PayPal has placed a hold. Rally has not necessarily charged it. |
| Checking payment | The provider outcome is pending or uncertain. This is not a confirmed booking. |
| Payment complete | Your charge is verified. The group is booked only when every required payment completes. |
| Refund or release in progress | Rally has started recovery; the result still needs confirmation. |
| Studio action needed | An outcome needs investigation or reconciliation. It cannot be treated as success. |

The studio opens a two-hour approval window for an exact offer. Each person's
consent is bound to its roster, session, price, pickup arrangements and terms.
The server verifies payer identity, amount, currency and provider resources.
A browser return from PayPal is not proof of payment.

## Separate transactions require recovery

Rally begins collecting only after every required authorization qualifies.
It confirms the booking only after every required capture is verified.

The transactions are separate, not atomic. If collection fails after a charge
completed, Rally starts a refund for that charge and releases remaining holds.
A hold can affect available funds before a completed charge. Refunds and releases
may take time, and uncertain results remain visible until verified. Nobody is
charged another friend's missing share.

A closed offer says “You weren't charged” only if that person has no payment
operations at all. Any payment activity retains the full status and recovery
view. The studio can investigate unresolved operations and append evidence, but
cannot turn a report into a verified payment outcome.

## Who sees what

| Information | Audience |
| --- | --- |
| Spending limit, availability, leave-by time and private note | The person who entered them; processed by Rally's server. |
| Names, readiness and shared matching sessions | Active group members. |
| Named payment-approval progress | The organizer; account and transaction details remain private. |
| Pickup request and arrangement | Its owner, the nominated friend and the studio. |
| Personal payment status | The payer; the studio has its merchant payment-resolution view. |
| Raw text submitted for an optional AI check | The consenting person, Rally and the AI provider, Astropods. |
| Notice of directly arranged personal needs | The studio, only after the person's explicit disclosure consent; no identity or note is attached to the notice. |

The AI receives submitted text and public studio facts, without other friends'
preferences or saved budget/availability fields. Anything you type in the message
itself is part of that submission. Do not include information you do not want
processed by the provider. Contact details are excluded from worker requests.

The AI cannot volunteer a friend, consent to disclosure, waive a must-have,
reserve a session or authorize a financial operation. Every proposed meaning
requires the person's confirmation. [AI behavior](ai-evaluation.md).

## Withdrawal and cancellation

Withdrawing during approval closes the offer for everyone. The organizer and
the withdrawing person can see who withdrew; other friends see only that a
friend withdrew. A person's opt-out remains in force across later rounds, and
only that person can reverse it. New offers require new payment approvals.

After settlement begins or the booking confirms, the studio reviews cancellation
requests under the published terms. Rally does not promise automatic individual
refunds. A studio cancellation starts full refunds of completed shares and
release of remaining holds, with results kept visible until confirmed.

## Stored records and expiry

Unconfirmed message drafts expire after thirty minutes. The default saved-note
policy clears raw notes and model quotations thirty days after planning ends,
including historical copies. Structured confirmed choices, consent, exact offer
terms and financial audit records remain. Expiry in Rally does not establish
that an external provider or its backups deleted their copies.

See [private text retention](private-text-retention.md) for timestamps, cleanup
and operator controls, and [verification](../evidence/README.md) for the scope of
recorded payment and privacy checks.
