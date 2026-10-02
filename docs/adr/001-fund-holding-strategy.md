# ADR-001: Fund holding strategy

**Status:** Proposed
**Date:** 2026-10-02
**Author:** Vivek (drafted with Claude)

## Context
PRD §9 asked how to hold funds for an order that could take about 3 weeks, given that a card authorization (hold) lasts only about 7 days. After the discussion on this issue, the product rules changed so the problem is smaller: the goal of the project is to learn the authorize-then-capture payment flow, so the PRD now fits the order into the hold window instead of stretching the hold.

Constraints:
- A card hold lasts about 7 days. Capturing after it expires fails, because there is nothing left to capture.
- Money state changes only from verified Stripe webhook events, and money-moving calls use idempotency keys (CLAUDE.md).
- The creator is paid 90% of the price, the platform keeps 10% (PRD §5).
- Creators are Stripe Connect Express accounts (US-1).
- Related user stories: US-3 (request), US-4 (accept), US-5 (upload), US-7 (payment), US-8 (cancel).

## Options considered
### Option A — Authorize at request, capture at approval (the original PRD)
The client pays by card at order time, the hold is kept through delivery and review, and the payment is captured on approval.
- Pros: the creator is protected from the start, and the client is protected until approval.
- Cons: request + accept + delivery + review + revisions can exceed 7 days, so the hold would expire before capture. It fails the PRD's own constraint.

### Option B — Capture at request, hold the money in the platform balance, transfer on approval
The client is charged in full at order time. The platform keeps the funds in its Stripe balance and transfers them to the creator on approval (separate charges and transfers).
- Pros: no hold expiry, so any duration works.
- Cons: a decline or timeout needs a refund (Stripe's processing fee is typically not returned), the platform carries refund and dispute risk, and it skips the authorize-then-capture flow this project exists to practice.

### Option C — Save the card at request, authorize at acceptance, capture at delivery
The client saves a card (SetupIntent) when requesting. When the creator accepts, the platform places a hold for the full price off-session. When the delivery is verified, the platform captures it. There is no client review step.
- Pros: the hold only has to cover the delivery window, which fits inside 7 days. A decline or timeout costs nothing, because nothing was charged. It is the authorize-then-capture flow in its simplest form.
- Cons: the authorization happens off-session, after the creator has accepted, so it can fail (decline, or the bank needs the client to authenticate). A saved card is not proof of funds. With no review step, the client has no recourse after capture other than a manual admin refund.

### Option D — Orders longer than the hold window (deferred or rolling authorization, or charging at acceptance)
For orders that cannot fit in about 5 days, either re-authorize on a schedule, authorize later, or charge at acceptance and hold the money.
- Pros: supports longer jobs.
- Cons: deferred authorization suits events with a known start time (a carpool); in Handoff the creator starts work at acceptance, so the creator would be unprotected. Rolling re-authorization repeats the failure modes of Option C every cycle. Charging at acceptance is Option B again. Out of scope for v1.

## Decision
Option C: save the card at request, authorize at acceptance, capture at delivery, with the delivery window capped at 5 days and no client review step. The authorization is made on behalf of the creator's connected account with a 10% application fee, so the capture also pays the creator.

## Why
- The hold only has to cover the delivery window (at most 5 days from acceptance), so it fits inside the ~7-day limit with 2 days of margin for upload time and retries.
- Nothing is charged until delivery, so a decline, a timeout, or a cancellation needs no refund and loses no processing fees.
- The capture is the single money-moving step: one call to make idempotent, and it also pays the creator, so there is no separate payout to get wrong.
- It exercises the real authorize-then-capture flow, including its failure modes, which is the purpose of this project.
- Option B was rejected because it avoids the learning goal and costs refunds. Option A was rejected because it cannot work. Option D is deferred.

## Consequences
- What becomes easier:
  - Declines, timeouts, and cancellations cost nothing.
  - One idempotent call (capture) moves the money and pays the creator.
  - There is no review, revision, or auto-approve logic to build.
- What becomes harder / new risks we accept:
  - The off-session authorization at acceptance can fail after the creator accepted. The creator must not start work until the hold is confirmed, and the order needs a state and a time limit for fixing it.
  - If the creator delivers after the hold expires, the capture fails and the creator is not paid by the platform. The delivery window is capped to prevent this, but a late or slow upload is still a risk.
  - With no review step, a client who is unhappy has only a manual admin refund (and Stripe's processing fee is typically not returned).
  - Orders that need more than about 5 days are not supported in v1.
- What we must build or monitor:
  - An "awaiting authorization" state, a retry window, and a delivery deadline tied to the hold expiry (ADR-003 for the scheduler; the order state machine is written by the owner).
  - Webhook handling for `setup_intent.succeeded`, `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, and the failure and cancellation events. The exact event set must be confirmed in Stripe test mode.
  - Idempotency keys on the PaymentIntent creation and on the capture.
  - Alerts when a capture fails (US-10), and the metric "authorization success rate at acceptance".
  - To verify in test mode before building: that the transfer to the creator happens on capture for a manual-capture destination charge, and what Stripe returns for a refund of a captured destination charge.

## References
- Stripe: [Place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- Stripe: [Save a card with a SetupIntent](https://docs.stripe.com/payments/save-and-reuse)
- Stripe: [Connect charge types](https://docs.stripe.com/connect/charges) (destination charges and application fees)
- Stripe: [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
