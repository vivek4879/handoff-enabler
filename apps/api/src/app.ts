import express from "express";
import type { Pool } from "pg";

// The app only needs to run queries, so that is all it asks for. Production
// passes the real pg Pool; tests pass a fake with just a query method.
type Database = Pick<Pool, "query">;

type AppDependencies = {
  db: Database;
};

export function createApp({ db }: AppDependencies) {
  const app = express();

  // NOTE: when the Stripe webhook route is added, it must use
  // express.raw({ type: "application/json" }) on that route specifically,
  // mounted BEFORE this global JSON parser — Stripe's signature verification
  // needs the raw request body bytes, and express.json() below would consume
  // and parse the stream before the webhook handler ever saw it.
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.status(200).json({ status: "ok", db: "connected" });
    } catch (error) {
      console.error(JSON.stringify({ msg: "health check db query failed", error: String(error) }));
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  return app;
}
