---
description: Start work on a GitHub issue with a plan and no code yet
argument-hint: <issue-number>
---
We are starting work on issue #$ARGUMENTS.

1. Read the issue (`gh issue view $ARGUMENTS` if the GitHub CLI is available; otherwise ask me to paste it).
2. Read the matching user story in `docs/prd.md`, plus `docs/architecture.md` and any relevant ADRs in `docs/adr/`.
3. Check CLAUDE.md: if this issue touches something I write myself (webhook handler, order state machine, money tests, ADRs), say so and switch to guiding mode instead of writing that part.
4. Present a plan:
   - Acceptance criteria restated as a checklist
   - Files to create or change
   - Step-by-step approach, small enough to review each step
   - At least one alternative approach and why you'd reject it
   - Concepts I should understand before we start, with doc links
   - Any decision that needs a new ADR
5. Stop and wait for my approval. Write no code in this command.
