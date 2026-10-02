# PRD — Handoff: Video Commission Marketplace (v1)

**Status:** Draft · **Owner:** Vivek · **Last updated:** 2026-10-02

## 1. Problem
Independent video creators (choreographers, dance instructors, video editors) take custom work through DMs and informal payment apps. Clients risk paying for work that never arrives. Creators risk delivering work that never gets paid. Neither side has a trusted place to agree on the work, hold payment, and hand over large video files.

## 2. Users
- **Creator:** offers fixed-price video services (e.g. "Custom 60s choreography video", "Edit up to 10 min of footage"), receives payouts.
- **Client:** individual or small business that commissions a video, pays up front, reviews the delivery.
- **Admin (you):** monitors orders, payments, and failures. Can issue refunds manually.

## 3. Goals
1. A client can commission, pay, receive, and approve a custom video end to end.
2. Payment is secured before work starts and **released to the creator only after the client approves** (or auto-approval kicks in). How it is secured (card hold, when to authorize and capture) is decided in ADR-001.
3. Creators can reliably upload large video files (up to 5 GB) that survive network interruptions.
4. Every money movement is traceable, idempotent, and driven by confirmed Stripe events, not client redirects.

## 4. Non-goals (v1)
- In-app chat (a single brief field plus revision notes only)
- Reviews and ratings, search/recommendations (a simple creator list is enough)
- Dispute/chargeback handling beyond logging the event and alerting admin
- Watermarking, transcoding, or adaptive streaming
- Mobile apps, multi-currency (USD only), non-US creators
- Custom quotes (fixed-price services only)
- Orders that cannot go from request to delivery within ~6 days (long-lead bookings would need deferred or rolling authorization; ADR-001 records the options)

## 5. Order lifecycle
```
requested+paid → accepted → delivered → approved → paid_out
      │              │          │ ↑
      │              │          └─ revision_requested (max 2)
      ├─ declined / accept timeout (48h) → refunded
      └─ cancelled by client before acceptance → refunded
accepted → overdue (past due date) → client may cancel → refunded
```

### Timing rules
| Rule | Value |
|---|---|
| Creator must accept within | 48 hours, else auto-decline + full refund |
| Delivery window | Set per service, 1–4 days |
| Card hold budget | Accept (48h) + delivery (≤ 4 days) = 6 days, inside the ~7-day card hold, leaving 1 day of margin |
| Revisions | Up to 2; each resets due date by 3 days |
| Auto-approve | 5 days after latest delivery with no client action |
| Platform fee | 10% of order total, deducted from creator payout |

> Note: card authorization holds last about **7 days**, so v1 keeps the span from authorization to capture inside ~6 days (see the hold budget above). Review, revisions, and auto-approve come after delivery. Whether capture happens at delivery or at approval is decided in ADR-001; if it is approval, the delivery window must shrink further.

## 6. User stories & acceptance criteria

### Accounts
**US-0: As a user, I can sign up and log in as a client or a creator.**
- Email + password sign-up and login; passwords are hashed, never stored in plain text.
- Sessions survive a page refresh and can be logged out; protected pages and API routes reject unauthenticated requests.
- A user's role (client or creator) controls which pages and actions they can access.

### Creator onboarding
**US-1: As a creator, I can connect a payout account so I can get paid.**
- Creator completes Stripe-hosted onboarding and returns to the app.
- Account status (pending / verified / restricted) is shown and kept in sync via Stripe events.
- Creators cannot publish services until payouts are enabled.

**US-2: As a creator, I can create a service with a title, description, price ($20–$2,000), and delivery window.**
- Validation errors are shown inline. Price is stored in cents.

### Ordering & payment
**US-3: As a client, I can order a service by writing a brief and paying by card.**
- Payment uses Stripe Elements. Card data never touches our server.
- The order is marked paid **only after the server receives a confirmed payment event** — not when the browser redirects.
- Refreshing, double-clicking pay, or duplicate events never create two charges or two orders.
- Failed or 3-D Secure-declined payments show a clear error and leave no paid order.

**US-4: As a creator, I can accept or decline a paid order.**
- Decline or 48h timeout automatically refunds in full (or releases the card hold, depending on ADR-001); the client is notified.

### Delivery
**US-5: As a creator, I can upload a delivery video (MP4/MOV, up to 5 GB).**
- Upload goes directly from browser to storage in chunks. It does not pass through our API server.
- Progress bar is shown. A dropped connection or page reload can **resume** without starting over.
- Server verifies the completed file (size, type) before marking the order delivered.
- Abandoned incomplete uploads are cleaned up within 24 hours.

**US-6: As a client, I can watch the delivered video in the browser and request a revision with a note.**
- Video is served via short-lived signed URLs only. There are no public links.
- Revision button is disabled after 2 revisions.
- Full-quality download becomes available after approval (accepted v1 risk: a determined client could capture the stream).

### Completion & money
**US-7: As a client, I can approve the delivery, which releases payment to the creator.**
- On approval (or auto-approval at 5 days), the creator receives order total minus 10% fee.
- Payout release is idempotent: it cannot happen twice for one order.

**US-8: As a client, I can cancel for a full refund if the order is not yet accepted, or is past its due date.**

### Admin & operations
**US-9: As an admin, I can see every order's state history and every Stripe event processed for it.**

**US-10: As an admin, I am alerted when payment event processing fails repeatedly.**

## 7. Success metrics
| Metric | Why it matters | v1 target |
|---|---|---|
| Checkout conversion (order page → paid) | Payment UX health | Track baseline |
| Payment success rate | Stripe integration health | > 95% of attempts |
| Upload completion rate (started → completed) | Upload reliability | > 90% |
| Resumed uploads that complete | Proves resumability works | Track |
| Median time: paid → delivered → approved | Marketplace speed | Track |
| Refund rate, by reason | Creator reliability | Track |
| Event processing failures | Money-correctness risk | 0 unresolved > 1h |

## 8. Non-functional requirements
- **Correctness over speed:** money state changes are transactional and auditable.
- **Security:** webhook signatures verified, signed URLs expire (≤ 1h), role-based access (client only sees own orders).
- **Observability:** errors tracked, structured logs with request/order IDs, product events emitted for every metric above.
- **Testing:** payment and upload flows covered by automated end-to-end tests in Stripe test mode.

## 9. Open questions (to be resolved in ADRs)
1. **ADR-001:** How do we secure payment given the ~7-day card hold limit? When do we authorize and capture, and how do we handle orders that cannot fit in the window?
2. **ADR-002:** Chunked upload approach — S3 multipart with presigned URLs vs. TUS.
3. **ADR-003:** How are timed rules (48h accept, delivery deadline, card hold expiry, 5-day auto-approve, upload cleanup) executed reliably?
4. **ADR-004:** Authentication approach — own session auth vs. Auth.js vs. hosted provider.
5. Should the platform fee be refunded on cancellation? (Proposed: yes, full refund in v1.)
