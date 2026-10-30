<p><img src="public/brand/rally-logo-v1.png" alt="Rally" width="160"></p>

# Book together. Pay your own share.

Rally helps friends find a studio session that works for everyone and book it
without one person covering the group's bill. Dates, spending limits and
must-haves stay private. Each friend approves their own share through PayPal.

[Open Rally](https://rally.gowthamsarveswaran.com) ·
[Guides](https://rally.gowthamsarveswaran.com/docs) ·
[Developer setup](docs/development.md) ·
[Verification](evidence/README.md)

## How it works

1. **Bring your friends.** Start a plan and share its invite in your group chat.
2. **Find a session that fits.** Everyone adds their availability, private
   spending limit and requirements. Rally checks the studio's published options.
3. **Agree on pickup.** If someone needs a friend to pick up their piece after
   firing, both people explicitly agree to the arrangement.
4. **Get the studio's offer.** The studio reviews the session, roster, price and
   terms, reserves the time and opens a two-hour approval window.
5. **Approve your own share.** PayPal authorizes each person's payment. Rally
   starts collecting after all required authorizations qualify and confirms
   the booking after every payment completes.

Each person's next step appears at the top of their plan. A private conflict,
like a required $72 wheel session above a $60 spending limit, is explained to
that person. Friends see that a step remains, not the private answer behind it.

## AI helps clarify what a friend means

An optional AI draft can turn a message into activity and pickup choices, or
ask one question when the meaning matters. “I leave Friday” could mean someone
cannot attend, or that they need help picking up their fired piece. The person
reviews the proposed meaning before saving it; a pickup friend must still agree.

Rally uses Astropods for model inference. The AI receives the consenting person's
submitted message and public studio facts. It cannot choose a spending limit,
volunteer another friend, reserve a session or approve a payment. The form
remains available throughout. [AI behavior and evaluation](docs/ai-evaluation.md).

## Separate payments, one booking decision

Each payment goes directly to the studio, without an organizer's payment pool.
These are separate transactions. If settlement fails partway through, Rally
starts refunds for completed charges and releases remaining holds. Uncertain
outcomes stay visible until verified; they do not count as a confirmed booking.

[Payment and privacy details](docs/payments-and-privacy.md) explain approvals,
pickup visibility, withdrawals and recovery.

## Try it or run it locally

The [hosted app](https://rally.gowthamsarveswaran.com) uses email-link sign-in.
The current release is a **PayPal sandbox application with a fictional pottery
studio**; it does not sell real sessions or take live payments. Its Free host
can take about a minute to wake.

- [Use Rally](docs/product-guide.md): invitations, private choices, studio offers
  and payment status.
- [Run the automated checks](docs/development.md#test-without-external-accounts):
  local PostgreSQL and controlled providers; no external accounts required.
- [Run the application](docs/development.md#run-the-app): Supabase Auth,
  sandbox PayPal and optional AI configuration.
- [Inspect recorded results](evidence/README.md): hosted sandbox settlement,
  recovery checks, model evaluations and current verification limits.

The core uses Next.js, React, TypeScript and PostgreSQL. Supabase supplies Auth
and hosted storage; the preview runs on Render. See the
[architecture](docs/architecture.md) and [operations guide](docs/deployment.md).

Licensed under [MIT](LICENSE).
