# Roadmap — Handoff v1

One sprint ≈ 1 week, ending with something deployed. Each line is a GitHub issue; the milestone is the sprint.
Labels: area (`payments`, `uploads`, `infra`, `docs`, `core`) + type (`feature`, `bug`, `chore`).

**Current sprint:** S0 · **Current issue:** _update this line as you go_

## S0 · Setup
- [ ] Scaffold monorepo: Next.js web + Node/TS API + Postgres — `infra`
- [ ] Set up CI: lint, typecheck, test on PRs — `infra`
- [ ] Add CLAUDE.md learning-project rules — `docs`
- [ ] ADR-001: Fund holding strategy — `docs`
- [ ] ADR-002: Resumable upload approach — `docs`
- [ ] ADR-003: Scheduling timed order rules — `docs`
- [ ] ADR-004: Authentication approach — `docs`

## S1 · Accounts & onboarding
- [ ] US-0: Users sign up and log in as client or creator — `core`
- [ ] US-1: Creator payout account onboarding (Stripe Connect) — `payments`
- [ ] US-2: Creator can create a fixed-price service — `core`

## S2 · Payments
- [ ] US-3: Client orders a service and pays by card — `payments`
- [ ] US-4: Creator accepts or declines order; auto-refund on decline/timeout — `payments`
- [ ] US-8: Client cancels order for full refund — `payments`

## S3 · Uploads
- [ ] US-5: Resumable multipart video upload to R2 — `uploads`

## S4 · Delivery & approval
- [ ] US-6: Client watches delivery and requests revision — `uploads`
- [ ] US-7: Approval releases payout to creator — `payments`
- [ ] Run timed rules: 48h accept timeout, 5-day auto-approve — `infra`

## S5 · Quality & operations
- [ ] US-9: Admin order history and Stripe event log — `core`
- [ ] US-10: Alert on repeated event processing failures — `infra`
- [ ] E2E tests: hire → pay → upload → approve — `infra`
- [ ] Emit product metrics events — `infra`

## After v1 (not now)
- v2: job queue + worker (SQS), transactional outbox, video processing worker, failure injection
- Operations: runbook, simulated incident + postmortem

## Reading (DDIA)
- S1–S2: Ch. 7 Transactions
- S3–S4: Ch. 8 The Trouble with Distributed Systems
- S5: Ch. 9 Consistency and Consensus
- v2: Ch. 5 Replication

After each chapter, add a note in `docs/notes/` on where it shows up in the code.
