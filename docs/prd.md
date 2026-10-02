# PRD — Handoff: Video Commission Marketplace (v1)

**Status:** Draft · **Owner:** Vivek · **Last updated:** 2026-10-02

## 1. Problem
Independent video creators (choreographers, dance instructors, video editors) take custom work through DMs and informal payment apps. Clients risk paying for work that never arrives. Creators risk delivering work that never gets paid. Neither side has a trusted place to agree on the work, hold payment, and hand over large video files.

## 2. Users
- **Creator:** offers fixed-price video services (e.g. "Custom 60s choreography video", "Edit up to 10 min of footage"), receives payouts.
- **Client:** individual or small business that commissions a video, saves a card, and receives the delivery.
- **Admin (you):** monitors orders, payments, and failures. Can issue refunds manually.

## 3. Goals
1. A client can commission, pay, and receive a custom video end to end.
2. The client's card is **authorized when the creator accepts and charged only when the video is delivered**, which also pays the creator. Details in ADR-001.
3. Creators can reliably upload large video files (up to 5 GB) that survive network interruptions.
4. Every money movement is traceable, idempotent, and driven by confirmed Stripe events, not client redirects.

## 4. Non-goals (v1)
- In-app chat (a single brief field only)
- Reviews and ratings, search/recommendations (a simple creator list is enough)
- Dispute/chargeback handling beyond logging the event and alerting admin
- Watermarking, transcoding, or adaptive streaming
- Mobile apps, multi-currency (USD only), non-US creators
- Custom quotes (fixed-price services only)
- Orders that need more than ~5 days from acceptance to delivery (they would need re-authorization or charging at acceptance; ADR-001 records the options)
- Client review, approval, and revision requests (payment is captured on delivery; admin can refund manually)

## 5. Order lifecycle
The client's card is **saved at request, authorized (held) when the creator accepts, and captured when the delivery is verified**. There is no client review or approval step: capture pays the creator.
```
requested (card saved) → accepted (card authorized) → delivered (captured, creator paid)
      │                        │
      │                        ├─ authorization fails → client has a fixed window to fix it → else cancelled
      │                        └─ overdue (past due date) → client may cancel → hold released
      ├─ declined / accept timeout (48h) → closed, nothing charged
      └─ cancelled by client before acceptance → closed, nothing charged
```

### Timing rules
| Rule | Value |
|---|---|
| Creator must accept within | 48 hours, else auto-decline (nothing was charged) |
| Delivery window | Set per service, 1–5 days, counted from acceptance |
| Card hold budget | The hold starts at acceptance and lasts about 7 days. Delivery (≤ 5 days) leaves 2 days of margin for upload time, retries, and scheduler lag |
| Authorization retry window | Fixed window to fix a failed authorization (value set in ADR-003) |
| Platform fee | 10% of order total, taken when the payment is captured |

> Note: card authorization holds last about **7 days**, so the delivery window is capped to keep capture inside the hold. A delivery that misses the window can no longer be captured. Orders that need a longer window are out of scope for v1 (see ADR-001 for the options).

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
**US-3: As a client, I can request a service by writing a brief and saving a card.**
- Card entry uses Stripe Elements. Card data never touches our server. Nothing is charged or held at this point.
- The card counts as saved **only after the server receives a confirmed Stripe event** — not when the browser redirects.
- Refreshing, double-clicking, or duplicate events never create two orders or two saved cards for one request.
- A card that fails to save (including 3-D Secure failure) shows a clear error and leaves no requested order.

**US-4: As a creator, I can accept or decline a requested order.**
- Accepting authorizes the saved card for the full price (a hold, not a charge). The creator is told to start work only after the hold is confirmed by a Stripe event.
- If the authorization fails (declined, or the bank needs the client to authenticate), the client is notified and has a fixed window to fix it; otherwise the order is cancelled.
- Decline or 48h timeout closes the order; nothing was charged and the client is notified.

### Delivery
**US-5: As a creator, I can upload a delivery video (MP4/MOV, up to 5 GB).**
- Upload goes directly from browser to storage in chunks. It does not pass through our API server.
- Progress bar is shown. A dropped connection or page reload can **resume** without starting over.
- Server verifies the completed file (size, type) before marking the order delivered, then captures the held payment (see US-7).
- The upload must complete before the order's due date, which falls inside the card hold.
- Abandoned incomplete uploads are cleaned up within 24 hours.

**US-6: As a client, I can watch and download the delivered video.**
- Video is served via short-lived signed URLs only. There are no public links.
- Full-quality download is available once the order is delivered and paid (accepted v1 risk: a determined client could capture the stream).

### Completion & money
**US-7: As a creator, I am paid when my delivery is verified.**
- Capturing the held payment pays the creator the order total minus the 10% fee.
- Capture is idempotent: it cannot happen twice for one order.
- If capture fails (for example, the hold expired), the order is not marked paid and the admin is alerted (US-10).

**US-8: As a client, I can cancel an order that is not yet accepted, or whose creator is past the due date.**
- Before acceptance nothing was charged. Past the due date the card hold is released. Neither case needs a refund.

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
| Median time: requested → accepted → delivered | Marketplace speed | Track |
| Cancellations and admin refunds, by reason | Creator reliability | Track |
| Authorization success rate at acceptance | Off-session card risk (a saved card is not proof of funds) | Track |
| Event processing failures | Money-correctness risk | 0 unresolved > 1h |

## 8. Non-functional requirements
- **Correctness over speed:** money state changes are transactional and auditable.
- **Security:** webhook signatures verified, signed URLs expire (≤ 1h), role-based access (client only sees own orders).
- **Observability:** errors tracked, structured logs with request/order IDs, product events emitted for every metric above.
- **Testing:** payment and upload flows covered by automated end-to-end tests in Stripe test mode.

## 9. Open questions (to be resolved in ADRs)
1. **ADR-001:** How do we secure payment given the ~7-day card hold limit? (Decided: save the card at request, authorize at acceptance, capture at delivery, cap the delivery window. See ADR-001.)
2. **ADR-002:** Chunked upload approach — S3 multipart with presigned URLs vs. TUS.
3. **ADR-003:** How are timed rules (48h accept, authorization retry window, delivery deadline and card hold expiry, upload cleanup) executed reliably?
4. **ADR-004:** Authentication approach — own session auth vs. Auth.js vs. hosted provider.
5. Should the platform fee be refunded when an admin refunds a captured order? (Proposed: yes, full refund in v1.)
