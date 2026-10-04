import { Pool } from "pg";

// Tests run against a separate database so they can never touch dev data.
// CI provides TEST_DATABASE_URL; locally the default points at the
// handoff_test database next to handoff_dev in docker compose.
const DEFAULT_TEST_DATABASE_URL = "postgres://handoff:handoff@localhost:5432/handoff_test";

export function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
  });
}

// Empties every table that tests write to. Run before each test so no test
// depends on what an earlier one left behind. CASCADE also clears tables that
// reference users (such as sessions).
export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE users CASCADE");
}
