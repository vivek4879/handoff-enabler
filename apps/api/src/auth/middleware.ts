import type { RequestHandler, Response } from "express";
import type { Role } from "../users/user.js";
import type { PublicUser } from "./authService.js";
import { readSessionToken } from "./sessionCookie.js";

// All the middleware needs from the auth service. Naming it here keeps this
// file independent of the service's other methods (and easy to fake in tests).
export type SessionAuthenticator = {
  getSessionUser(sessionToken: string | null): Promise<PublicUser | null>;
};

// Express lets a middleware pass data to later handlers through res.locals.
const USER_KEY = "user";

// Handlers behind requireAuth call this to get the logged-in user. If it is
// called where requireAuth did not run, that is a mistake in our own code, not
// something a client did, so it throws (a 500) instead of answering 401.
export function authenticatedUser(res: Response): PublicUser {
  const user = res.locals[USER_KEY] as PublicUser | undefined;
  if (!user) {
    throw new Error("requireAuth must run before this handler");
  }
  return user;
}

// 401 = "I don't know who you are" (no valid session).
export function createRequireAuth(auth: SessionAuthenticator): RequestHandler {
  return async (req, res, next) => {
    const user = await auth.getSessionUser(readSessionToken(req.headers.cookie));
    if (!user) {
      // The same answer for no cookie, a bad cookie and an expired session.
      res.status(401).json({ error: "authentication required" });
      return;
    }
    res.locals[USER_KEY] = user;
    next();
  };
}

// 403 = "I know who you are, and you are not allowed to do this".
// Must come after requireAuth.
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const user = authenticatedUser(res);
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

// CSRF defence. A browser attaches our session cookie to ANY request to our
// site, including ones triggered by a different, malicious site. That site's
// pages cannot add custom headers to such a request (doing so makes the browser
// ask our server's permission first, which we never grant), but our own web
// app can. So a state-changing request that carries this header must have
// come from our own frontend. SameSite=Lax on the cookie is the first layer;
// this is the second.
export const CSRF_HEADER_NAME = "x-requested-with";
export const CSRF_HEADER_VALUE = "handoff-web";

// Only these methods are exempt, because they must never change anything.
// Listing the safe ones (not the unsafe ones) means a method we forgot about is
// protected by default.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireCsrfHeader: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER_NAME) === CSRF_HEADER_VALUE) {
    next();
    return;
  }
  res.status(403).json({ error: "missing or invalid CSRF header" });
};
