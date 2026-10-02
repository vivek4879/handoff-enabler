# Architecture — Handoff v1

Status: draft. Anything marked **(ADR pending)** is not decided yet — do not implement it until the ADR is accepted.

## Components
```
 Browser (Next.js on Vercel)
   │  HTTPS (JSON)              │ presigned PUT per part
   ▼                            ▼
 API (Node/TS on Railway) ──► Cloudflare R2 (video storage)
   │         ▲
   │         │ webhooks (signed)
   ▼         │
 Postgres   Stripe (Connect + PaymentIntents)
 (Railway)
   ▲
   │
 Scheduler for timed rules (ADR-003)
```

| Component | Responsibility |
|---|---|
| Web | UI, Stripe Elements for card entry, chunked uploads straight to R2 |
| API | Auth, business rules, order state machine, Stripe calls, presigned URLs, webhook endpoint |
| Postgres | Source of truth for users, services, orders, order history, uploads, processed Stripe events |
| R2 | Stores delivery videos; private bucket, access only via signed URLs |
| Stripe | Card payments, creator payout accounts, transfers, refunds |
| Scheduler | 48h accept timeout, authorization retry window, delivery deadline and card hold expiry **(ADR-003)** |

## Key flows (high level)

**Request and hold (US-3, US-4)** — per ADR-001
1. Client submits brief → API creates the order (`requested`) and a SetupIntent (with idempotency key).
2. Browser saves the card with Stripe Elements. Nothing is charged.
3. Stripe sends `setup_intent.succeeded` → API verifies signature, dedupes by event ID, records the saved card in a transaction.
4. Creator accepts → API creates a PaymentIntent for the full price with manual capture, off-session, charging on behalf of the creator's connected account with a 10% application fee (idempotency key).
5. Stripe sends `payment_intent.amount_capturable_updated` → API marks the hold in place. The creator starts work only after this. Failed or authentication-required authorizations notify the client and start the retry window.
6. The browser redirect only shows status; it never changes state.

**Upload a delivery (US-5)** — approach (ADR-002)
1. API starts a multipart upload and returns presigned URLs for parts.
2. Browser uploads parts directly to R2, tracks ETags, can resume by asking the API which parts exist.
3. API completes the upload, verifies size/type, marks order delivered, then captures the held payment (see below).

**Capture on delivery (US-7)** — per ADR-001
1. After the delivery is verified, API captures the PaymentIntent (idempotency key). The funds go to the creator minus the 10% fee as part of the capture.
2. Stripe sends `payment_intent.succeeded` → API verifies, dedupes, marks the order paid in a transaction. A failed capture (for example, an expired hold) leaves the order unpaid and alerts the admin.

## Proposed repo layout
```
/apps/web        Next.js frontend
/apps/api        Node/TS API
/docs            prd.md, roadmap.md, architecture.md, adr/, notes/
/.claude         Claude Code commands
CLAUDE.md
```

## Environments
| Env | Stripe | R2 bucket | Deploy trigger |
|---|---|---|---|
| dev | test mode | handoff-dev | local |
| staging | test mode | handoff-staging | merge to `main` |
| production | live mode (later) | handoff-prod | manual release |
