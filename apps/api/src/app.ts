import express from "express";
import type { Pool } from "pg";
import { createAuthRoutes, type AuthApi } from "./auth/authRoutes.js";
import { requireCsrfHeader } from "./auth/middleware.js";
import { errorHandler } from "./errorHandler.js";

// The app only needs to run queries, so that is all it asks for. Production
// passes the real pg Pool; tests pass a fake with just a query method.
type Database = Pick<Pool, "query">;

type AppDependencies = {
  db: Database;
  auth: AuthApi;
  // Cookies marked Secure are only sent over HTTPS. On in production.
  secureCookies: boolean;
};

export function createApp({ db, auth, secureCookies }: AppDependencies) {
  const app = express();

  // Express adds "X-Powered-By: Express" to every response by default. There is
  // no reason to tell the world which framework we run.
  app.disable("x-powered-by");

  // NOTE: when the Stripe webhook route is added, it must use
  // express.raw({ type: "application/json" }) on that route specifically,
  // mounted BEFORE this global JSON parser — Stripe's signature verification
  // needs the raw request body bytes, and express.json() below would consume
  // and parse the stream before the webhook handler ever saw it.
  app.use(express.json());

  // Every state-changing request must carry the CSRF header (a Stripe webhook
  // route, called by Stripe and not by a browser, will have to be mounted
  // before this line).
  app.use(requireCsrfHeader);

  app.get("/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.status(200).json({ status: "ok", db: "connected" });
    } catch (error) {
      console.error(JSON.stringify({ msg: "health check db query failed", error: String(error) }));
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  app.use("/auth", createAuthRoutes({ auth, secureCookies }));

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  // Must be last: it catches errors thrown by everything above.
  app.use(errorHandler);

  return app;
}
