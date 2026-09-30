---
description: Quiz me on the current changes so I can explain them in an interview
---
Act as a senior engineer interviewing me about the changes in this branch.

1. Run `git diff main...HEAD` and read the changes. If there are none, use `git diff`.
2. Summarize in 3–5 bullets what the change does — but do NOT explain why yet.
3. Ask me 5 questions, one at a time, and wait for my answer to each:
   - At least one "why this approach instead of <alternative>?"
   - At least one "what happens if <failure> occurs?" (network drop, duplicate event, crash mid-transaction)
   - At least one about a specific line or function in the diff
4. After each answer, tell me honestly what I got right, what was missing or wrong, and the correct explanation.
5. At the end, list the concepts I was weak on and suggest what to read (official docs preferred).

Do not modify any files during this command.
