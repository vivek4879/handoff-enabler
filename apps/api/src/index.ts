import express from "express";
import { pool } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// NOTE: when the Stripe webhook route is added, it must use
// express.raw({ type: "application/json" }) on that route specifically,
// mounted BEFORE this global JSON parser — Stripe's signature verification
// needs the raw request body bytes, and express.json() below would consume
// and parse the stream before the webhook handler ever saw it.
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "connected" });
  } catch (error) {
    console.error(JSON.stringify({ msg: "health check db query failed", error: String(error) }));
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(port, () => {
  console.log(JSON.stringify({ msg: "api listening", port }));
});
