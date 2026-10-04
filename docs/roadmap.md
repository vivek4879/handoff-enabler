# Roadmap — Handoff v1

One sprint ≈ 1 week, ending with something deployed. Each line is a GitHub issue; the milestone is the sprint.
Labels: area (`payments`, `uploads`, `infra`, `docs`, `core`) + type (`feature`, `bug`, `chore`).

**Current sprint:** S0 · **Current issue:** [#8 US-0a: API sign-up, login, sessions, and role guards](https://github.com/vivek4879/handoff-enabler/issues/8)

## S0 · Setup
- [x] Scaffold monorepo: Next.js web + Node/TS API + Postgres — `infra`
- [x] Set up CI: lint, typecheck, test on PRs — `infra`
- [ ] Add `pnpm build` to CI (#25) — `infra`
- [x] Set up Vitest and first tests (#26) — `infra`
- [x] Add CLAUDE.md learning-project rules — `docs`
- [x] ADR-001: Fund holding strategy — `docs`
- [x] ADR-002: Resumable upload approach — `docs`
- [x] ADR-003: Scheduling timed order rules — `docs`
- [x] ADR-004: Authentication approach — `docs`
- [x] ADR-006: Database migration tool (#28) — `docs`
- [x] Choose and wire up a DB migration tool (#29) — `infra`

## S1 · Accounts & onboarding
- [ ] US-0a: API sign-up, login, sessions, and role guards (#8) — `core`
- [ ] US-0b: Web sign-up, login, and protected pages (#36) — `core`
- [ ] Rate-limit login attempts (#37) — `core`
- [ ] US-1: Creator payout account onboarding (Stripe Connect) — `payments`
- [ ] US-2: Creator can create a fixed-price service — `core`
- [ ] CI: apply migrations to a fresh Postgres (#33) — `infra`

## S2 · Payments
- [ ] US-3: Client requests a service and saves a card — `payments`
- [ ] US-4: Creator accepts (card authorized) or declines; nothing charged on decline/timeout — `payments`
- [ ] US-8: Client cancels before acceptance or past the due date — `payments`

## S3 · Uploads
- [ ] US-5: Resumable multipart video upload to R2 — `uploads`

## S4 · Delivery & approval
- [ ] US-6: Client watches and downloads the delivered video — `uploads`
- [ ] US-7: Capture on verified delivery pays the creator — `payments`
- [ ] Run timed rules: 48h accept timeout, authorization retry window, delivery deadline / hold expiry — `infra`
- [ ] Delete expired sessions (#39) — `infra`

## S5 · Quality & operations
- [ ] US-9: Admin order history and Stripe event log — `core`
- [ ] US-10: Alert on repeated event processing failures — `infra`
- [ ] E2E tests: request → accept → upload → capture — `infra`
- [ ] Emit product metrics events — `infra`
- [ ] Run migrations on Railway before the new API version starts (#34) — `infra`

## After v1 (not now)
- v2: job queue + worker (SQS), transactional outbox, video processing worker, failure injection
- Operations: runbook, simulated incident + postmortem

## Reading (DDIA)
- S1–S2: Ch. 7 Transactions
- S3–S4: Ch. 8 The Trouble with Distributed Systems
- S5: Ch. 9 Consistency and Consensus
- v2: Ch. 5 Replication

After each chapter, add a note in `docs/notes/` on where it shows up in the code.
