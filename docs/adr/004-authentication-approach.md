# ADR-004: Authentication approach

**Status:** Accepted (on merge)
**Date:** 2026-10-02
**Author:** Vivek (drafted with Claude)

## Context
US-0: users sign up and log in with email and password as a **client** or a **creator**. Passwords are hashed. Sessions survive a refresh and can be logged out. Protected pages and API routes reject unauthenticated requests, and the role controls which pages and actions are allowed. A client may only see their own orders (PRD §8).

Architecture constraint: the web app (Next.js on Vercel) and the API (Express on Railway, ADR-005) are separate deployments, so the browser talks to two origins unless we arrange otherwise. The API is the single place that enforces authorization.

Not in scope for v1: social login, email verification, password reset, multi-factor authentication. They are noted as follow-ups.

## Options considered
### Option A — Own session authentication in the Express API
Sign-up and login endpoints. Passwords hashed with a memory-hard algorithm (argon2id). On login the API creates a server-side session row in Postgres and sets an opaque session id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. A middleware loads the session and user on every request, and a role guard checks the user's role.
- Pros: one source of truth for users and sessions, in our own database. Revocation is trivial (delete the row). It teaches sessions, cookies, CSRF, and password storage at the layer where they belong. Fits the existing stack and the repository/service layering.
- Cons: we own the security details (hashing parameters, session expiry, login rate limiting, CSRF). More code to write and review than the alternatives.

### Option B — Auth.js (NextAuth) in the Next.js app
- Pros: popular, integrates with Next.js.
- Cons: it lives in the web app, but authorization must be enforced in the separate API, so the API would need to verify Auth.js tokens too (two systems). Its credentials (email and password) support is deliberately limited and discouraged by its own docs, which is our only sign-in method.

### Option C — Hosted identity provider (for example Clerk or Auth0)
- Pros: least code, and password security is someone else's job.
- Cons: a vendor dependency and cost, user data outside our database (the API still needs its own users table keyed by the provider's id), and it hides the mechanisms we want to understand. Overkill for one sign-in method.

## Decision
Option A: own server-side session authentication in the Express API, with passwords hashed using argon2id, sessions stored in Postgres, and a role guard middleware. The browser reaches the API on the same origin as the web app by proxying `/api/*` through Next.js rewrites.

## Why
- Server-side sessions fit a split deployment with one API that must authorize every request, and they allow immediate logout and revocation.
- Same-origin through a rewrite means the cookie is first-party, so `SameSite=Lax` works without third-party cookie problems. A custom domain with `app.` and `api.` subdomains would also work but needs a domain we do not have yet.
- It keeps the identity data in our database, next to the orders it protects, and exercises the layer split from CLAUDE.md (route, service, repository).
- Option B adds a second token system, and Option C hides what this project is meant to teach. Both can be revisited if auth becomes a burden.

## Consequences
- What becomes easier:
  - Logging out, forcing a logout, and blocking a user are single database writes.
  - Roles live on the user row and are checked in one place.
- What becomes harder / new risks we accept:
  - We carry the security details. Passwords: argon2id with a per-password salt and sensible cost parameters (evaluate the `argon2` package under the dependency rule before adding it, or use Node's built-in `scrypt` if we want zero dependencies). Never log credentials. Return the same error for unknown email and wrong password.
  - Session ids: long random values, and store only a hash of the id in the database, so a database leak does not hand out live sessions. Idle and absolute expiry.
  - CSRF: `SameSite=Lax` plus a check on state-changing requests (a required custom header or a token). Explain this when we implement it.
  - Brute force: rate-limit login by IP and by account.
  - The Next.js rewrite adds a hop; keep it for JSON only (uploads go straight to R2, ADR-002).
- What we must build or monitor:
  - `users` (email unique, password hash, role) and `sessions` tables, created through the migration tool (ADR-006).
  - Session middleware, role guard, and tests for "unauthenticated is rejected" and "a client cannot read another client's order".
  - Metrics for failed logins; follow-ups for email verification and password reset.

## References
- OWASP: [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- OWASP: [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- OWASP: [CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- MDN: [Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies) (`SameSite`, `HttpOnly`, `Secure`)
- Next.js: [Rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
