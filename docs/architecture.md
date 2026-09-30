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
 Scheduler for timed rules (ADR-003 pending)
```

| Component | Responsibility |
|---|---|
| Web | UI, Stripe Elements for card entry, chunked uploads straight to R2 |
| API | Auth, business rules, order state machine, Stripe calls, presigned URLs, webhook endpoint |
| Postgres | Source of truth for users, services, orders, order history, uploads, processed Stripe events |
| R2 | Stores delivery videos; private bucket, access only via signed URLs |
| Stripe | Card payments, creator payout accounts, transfers, refunds |
| Scheduler | 48h accept timeout, 5-day auto-approve **(ADR-003 pending)** |

## Key flows (high level)

**Pay for an order (US-3)**
1. Client submits brief → API creates order (`pending_payment`) and a PaymentIntent (with idempotency key).
2. Browser confirms payment with Stripe Elements.
3. Stripe sends `payment_intent.succeeded` → API verifies signature, dedupes by event ID, marks order paid in a transaction.
4. The browser redirect only shows status; it never changes state.

**Upload a delivery (US-5)** — approach **(ADR-002 pending)**
1. API starts a multipart upload and returns presigned URLs for parts.
2. Browser uploads parts directly to R2, tracks ETags, can resume by asking the API which parts exist.
3. API completes the upload, verifies size/type, marks order delivered.

**Release payment (US-7)** — mechanism **(ADR-001 pending)**
1. Client approves (or auto-approve fires) → API moves funds to creator minus 10% fee, idempotently.

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
