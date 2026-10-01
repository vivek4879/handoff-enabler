# ADR-005: Express over hand-rolled node:http

**Status:** Accepted 
**Date:** 2026-10-01
**Author:** Vivek

## Context
What problem are we solving? What constraints matter (timing, cost, risk, PRD requirements)? Link the user stories involved.
Chose Express over hand rolled node:http server for apps/api.



## Options considered
### Option A — Fastify
Learnign curve is steep and not needed for current project so not selected.

### Option B — <name>
- Pros:
- Cons:

## Decision
Chose Express

## Why
node:http is Node's built in HTTP module.
Disadvantages:
1. Manual routing: you'd write if (req.url === ... && req.method === ...) for every endpoint, and there will be dozens.
2. JSON bodies: you read the stream, parse it, and handle malformed input and size limits yourself.
3. No middleware: auth checks, request IDs for logging, and error handling have to be wired by hand.

## Consequences
- What becomes easier: ROuting will be inbuilt, error handling will be wired.


## References
Links to official docs you used.
