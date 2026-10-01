import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// One pool, shared across requests. pg manages a small set of open
// connections and hands them out per query instead of opening a new
// TCP + auth handshake every time — that handshake is the expensive part.
export const pool = new Pool({ connectionString });
