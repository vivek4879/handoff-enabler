import { Router } from "express";
import type { AuthResult } from "./authService.js";
import { authenticatedUser, createRequireAuth, type SessionAuthenticator } from "./middleware.js";
import {
  clearedSessionCookieOptions,
  readSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "./sessionCookie.js";

// What the routes need from the auth service.
export type AuthApi = SessionAuthenticator & {
  signup(input: unknown): Promise<AuthResult>;
  login(input: unknown): Promise<AuthResult>;
  logout(sessionToken: string | null): Promise<void>;
};

type AuthRoutesDependencies = {
  auth: AuthApi;
  secureCookies: boolean;
};

// Routes only translate between HTTP and the service: read the request, call
// the service, write the response. The rules live in the service. Errors it
// throws (bad input, wrong password, duplicate email) are turned into status
// codes by the error handler. Express 5 forwards a rejected promise from an
// async handler there automatically.
export function createAuthRoutes({ auth, secureCookies }: AuthRoutesDependencies): Router {
  const router = Router();
  const requireAuth = createRequireAuth(auth);

  router.post("/signup", async (req, res) => {
    const { user, sessionToken, expiresAt } = await auth.signup(req.body);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(expiresAt, secureCookies));
    res.status(201).json({ user });
  });

  router.post("/login", async (req, res) => {
    const { user, sessionToken, expiresAt } = await auth.login(req.body);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(expiresAt, secureCookies));
    res.status(200).json({ user });
  });

  router.post("/logout", async (req, res) => {
    await auth.logout(readSessionToken(req.headers.cookie));
    res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions(secureCookies));
    res.status(204).end();
  });

  router.get("/me", requireAuth, (_req, res) => {
    res.status(200).json({ user: authenticatedUser(res) });
  });

  return router;
}
