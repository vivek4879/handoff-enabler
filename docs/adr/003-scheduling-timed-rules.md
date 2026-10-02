# ADR-003: Scheduling timed order rules

**Status:** Proposed
**Date:** 2026-10-02
**Author:** Vivek (drafted with Claude)

## Context
Several rules fire because time passed, not because a user did something (PRD §5, ADR-001):
- Creator must accept within **48 hours**, else the order closes (nothing was charged).
- A failed card authorization at acceptance gets a **fixed retry window**, else the order is cancelled.
- Delivery has a **due date** (1–5 days from acceptance). Past it, the order is overdue and the client may cancel, which releases the card hold. The hold itself expires after about 7 days, so a late delivery can no longer be captured.
- Abandoned incomplete uploads are cleaned up within **24 hours** (US-5, ADR-002).

Constraints: these rules touch money (releasing holds, cancelling orders), so each must run **at least once and effectively once**, survive restarts and deploys, and be testable without waiting real hours. v1 runs a single API instance on Railway with Postgres; a job queue and worker are planned for v2 (roadmap, "After v1").

## Options considered
### Option A — Deadlines stored in Postgres, polled by a sweeper in the API process
Each order row stores its deadlines as columns (`accept_by`, `authorize_fix_by`, `deliver_by`). A sweeper runs every minute (a timer inside the API process) and, in a transaction, selects due rows with `FOR UPDATE SKIP LOCKED`, applies the state transition, and records it in the order history.
- Pros: no new infrastructure. The deadline is data, so it survives restarts and is visible to admins (US-9). Transitions are plain database transactions, easy to test with an injected clock. Multiple instances stay safe because of `SKIP LOCKED`.
- Cons: precision is limited by the poll interval (up to about a minute late). Timers live in the API process, so a down API means no sweeps until it returns (it catches up on restart because the deadlines are still in the table). Polling queries need an index on the deadline columns.

### Option B — A Postgres-backed job queue library (for example pg-boss) with delayed jobs
Enqueue a delayed job per order when it is created or accepted; a worker runs it at the due time.
- Pros: precise timing, built-in retries and dead-letter handling.
- Cons: a new dependency and a second source of truth (the job and the order row can disagree, for example if the order changed state before the job fires). It overlaps with the planned v2 queue and worker, so it would be built twice.

### Option C — External cron (Railway cron) calling an internal endpoint
- Pros: separates scheduling from the API process.
- Cons: needs an authenticated internal endpoint, which is more attack surface, and still needs the sweeper logic from Option A behind it. It adds nothing but a trigger.

### Option D — A managed delayed-message service (for example SQS or a workflow engine)
- Pros: durable, scalable.
- Cons: far beyond v1 scale, new cloud account and cost, and some delayed-message limits (for example SQS's 15-minute maximum delay) do not fit multi-day rules. This is the v2 direction.

## Decision
Option A: store each deadline as a column on the order and run an in-process sweeper that polls for due rows once a minute, using row locking (`FOR UPDATE SKIP LOCKED`) and idempotent, transactional state transitions.

## Why
- The deadline is the single source of truth, in the database, next to the state it controls. There is nothing to keep in sync.
- The rules are expressed as ordinary transactions, which fits the existing rule that money state changes are transactional and recorded in the append-only order history.
- A one-minute lag is irrelevant for 48-hour and multi-day rules.
- It needs no new service, and it leaves a clean path to v2: the same "find due work, apply transition" function can later be driven by a queue worker instead of a timer.
- Option B was rejected because of the second source of truth and the overlap with v2. Options C and D add moving parts without solving a v1 problem.

## Consequences
- What becomes easier:
  - Admins can see exactly when each order will time out (US-9).
  - Tests call the sweeper function with a fake "now" instead of waiting.
- What becomes harder / new risks we accept:
  - Every transition must be idempotent: the sweeper may see the same row twice (crash after the update but before the log, or two instances). The `WHERE state = <expected>` guard plus the row lock makes a second run a no-op.
  - Money-moving transitions (cancelling a hold) must use Stripe idempotency keys derived from the order, so a retry does not double-act.
  - A deadline can pass while the API is down. On restart, the sweeper handles the backlog, so transitions must tolerate being late.
  - Race with user actions: a creator can accept at the same moment the timeout fires. The state check inside the transaction decides, and the loser gets a clear error.
  - The hold expiry is tied to Stripe's authorization time, not to our `deliver_by`. The due date is set with margin (PRD: 2 days inside the ~7-day hold). Check whether Stripe exposes the capture deadline on the charge and, if so, store it as a safety net.
- What we must build or monitor:
  - Deadline columns plus a partial index per rule (only on non-terminal states).
  - The sweeper function (pure, takes a clock and a database handle), its timer wiring, and structured logs per transition with `orderId`.
  - A metric and alert for sweeper lag (oldest overdue row) so a stalled sweeper is noticed, not discovered by a customer.
  - Upload cleanup as a second sweep (uploads older than 24 hours, aborted in R2).

## References
- PostgreSQL: [SELECT … FOR UPDATE / SKIP LOCKED](https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE)
- Stripe: [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Stripe: [Place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) (hold expiry)
