# CLAUDE.md — Handoff

## What this project is
Handoff is a video commission marketplace: a client pays up front, a creator uploads the finished video, and payment is released to the creator when the client approves.

**This is a learning project.** The owner (Vivek) is building it to deeply understand Stripe payments, resumable large-file uploads, and the full software development lifecycle well enough to explain every part in a job interview. Claude may write code, but **understanding matters more than speed.** Optimize for Vivek being able to explain every line.

Read these before any work:
- `docs/prd.md` — requirements, user stories (US-0 … US-10), acceptance criteria
- `docs/roadmap.md` — sprints and the current issue
- `docs/architecture.md` — components and data flow
- `docs/adr/` — accepted decisions. Do not contradict an accepted ADR.

## Stack
- **Web:** Next.js (App Router) + TypeScript → Vercel
- **API:** Node.js + TypeScript → Railway
- **DB:** PostgreSQL → Railway
- **Storage:** Cloudflare R2 (S3-compatible, AWS SDK v3, presigned multipart uploads)
- **Payments:** Stripe Connect (Express accounts) + PaymentIntents
- **Tests:** Vitest (unit/integration), Playwright (end-to-end), Stripe CLI for webhooks

## How we work (mandatory)
1. **One GitHub issue per branch and PR.** Branch name: `<type>/<issue-number>-short-name`, where `<type>` is `feat`, `fix`, `chore`, or `docs` (same as commit types). Reference the issue in the PR (`Closes #N`).
2. **Plan first.** Before writing code, present a plan: what files change, the approach, and at least one alternative you rejected and why. Wait for approval.
3. **Small steps.** Implement one step at a time. After each step, stop and summarize what changed and why.
4. **Explain the why.** For every non-trivial choice, explain the reasoning and trade-offs in plain language. Link to official docs (Stripe, AWS/R2, Postgres) where relevant.
5. **Flag decisions.** If a change needs an architectural decision not covered by an ADR, stop and propose a new ADR instead of deciding silently.
6. **No scope creep.** Implement only what the current issue's acceptance criteria require. Note ideas as follow-ups instead.
7. **CI gates every merge.** On `main`, the `verify` check (lint, typecheck, test) must pass and the branch must be up to date before merging, and this applies to admins too. In practice every change, docs and roadmap included, goes through a PR.

## Vivek writes these himself
Do not write the implementation for these. Explain concepts, ask guiding questions, suggest test cases, and review his code:
- The Stripe webhook handler (signature verification, idempotency, event dispatch)
- The order state machine (states, allowed transitions, guards)
- Tests for money logic (fee math, refunds, payouts)
- All ADRs

## Engineering rules
- **Money is integer cents.** Never use floats for money.
- **Never trust the client redirect.** Payment state changes only from verified Stripe webhook events.
- **Idempotency everywhere money moves:** Stripe idempotency keys on create calls; processed webhook event IDs stored and deduplicated.
- **Money state changes are transactional** and recorded in an append-only order history.
- **Uploads go browser → R2 directly** via presigned URLs. Video bytes never pass through the API.
- **Secrets** live in environment variables only. Never commit `.env` files or keys.
- TypeScript `strict` mode. No `any` without a comment explaining why.
- Structured logs (JSON) including `requestId` and `orderId` where available.

## Commands
Run these from the repo root unless noted. Requires Node 22 (`.nvmrc`) and Docker (for Postgres).
- Install: `pnpm install`
- Start Postgres (dev): `docker compose up -d` — Postgres 16, exposed on `localhost:5432` (`handoff`/`handoff`/`handoff_dev`). Check with `docker compose ps` (look for `(healthy)`).
- Dev (both apps): `pnpm dev` — web on `:3000`, API on `:4000`. Requires `apps/api/.env` to exist (copy from `apps/api/.env.example`).
- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck` (runs `next typegen` first for web; Next's generated types aren't committed)
- Test: `pnpm test` — placeholder until #26: it runs no tests, so a green CI Test step does not mean the code is tested.
- DB migrate: `…` — pending #29.

## Commits
Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
