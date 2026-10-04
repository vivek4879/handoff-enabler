import type { Pool } from "pg";

type Database = Pick<Pool, "query">;

type NewSession = {
  tokenHash: Buffer;
  userId: string;
  expiresAt: Date;
};

export type ActiveSession = {
  userId: string;
  expiresAt: Date;
};

type SessionRow = {
  user_id: string;
  expires_at: Date;
};

export function createSessionRepository(db: Database) {
  return {
    async create(newSession: NewSession): Promise<void> {
      await db.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)`,
        [newSession.tokenHash, newSession.userId, newSession.expiresAt],
      );
    },

    // "now" is passed in instead of read inside the SQL (now()), so callers and
    // tests control the clock. A session counts as expired once expires_at is
    // reached.
    async findActive(tokenHash: Buffer, now: Date): Promise<ActiveSession | null> {
      const result = await db.query<SessionRow>(
        `SELECT user_id, expires_at
         FROM sessions
         WHERE token_hash = $1 AND expires_at > $2`,
        [tokenHash, now],
      );
      const row = result.rows[0];
      return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
    },

    async delete(tokenHash: Buffer): Promise<void> {
      await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
    },
  };
}
