import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, resetDatabase } from "../testing/testDatabase.js";
import { createUserRepository } from "../users/userRepository.js";
import { createSessionRepository } from "./sessionRepository.js";
import { generateSessionToken, hashSessionToken } from "./sessionToken.js";

// Real Postgres, like the user repository tests: the foreign key, the cascade
// and the CHECK constraints are part of what we are testing.

let pool: Pool;

beforeAll(() => {
  pool = createTestPool();
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

async function createUser() {
  return createUserRepository(pool).create({
    email: "ada@example.com",
    passwordHash: "hash",
    role: "client",
  });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("sessionRepository", () => {
  it("finds an active session by the hash of its token", async () => {
    const user = await createUser();
    const sessions = createSessionRepository(pool);
    const tokenHash = hashSessionToken(generateSessionToken());
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    await sessions.create({ tokenHash, userId: user.id, expiresAt });
    const found = await sessions.findActive(tokenHash, new Date());

    expect(found?.userId).toBe(user.id);
    expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("returns null for a token that was never stored", async () => {
    const sessions = createSessionRepository(pool);

    const found = await sessions.findActive(hashSessionToken("unknown"), new Date());

    expect(found).toBeNull();
  });

  it("returns null once the session has expired", async () => {
    const user = await createUser();
    const sessions = createSessionRepository(pool);
    const tokenHash = hashSessionToken(generateSessionToken());
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);
    await sessions.create({ tokenHash, userId: user.id, expiresAt });

    // Move the clock forward instead of waiting seven days.
    const afterExpiry = new Date(expiresAt.getTime() + 1);

    expect(await sessions.findActive(tokenHash, afterExpiry)).toBeNull();
  });

  it("treats the exact expiry moment as expired", async () => {
    const user = await createUser();
    const sessions = createSessionRepository(pool);
    const tokenHash = hashSessionToken(generateSessionToken());
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);
    await sessions.create({ tokenHash, userId: user.id, expiresAt });

    // Boundary: a session is valid strictly before expires_at.
    expect(await sessions.findActive(tokenHash, expiresAt)).toBeNull();
  });

  it("deletes a session (logout)", async () => {
    const user = await createUser();
    const sessions = createSessionRepository(pool);
    const tokenHash = hashSessionToken(generateSessionToken());
    await sessions.create({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    await sessions.delete(tokenHash);

    expect(await sessions.findActive(tokenHash, new Date())).toBeNull();
  });

  it("does not fail when deleting a session that does not exist", async () => {
    const sessions = createSessionRepository(pool);

    // Logging out twice (or with a stale cookie) must not be an error.
    await expect(sessions.delete(hashSessionToken("nothing"))).resolves.toBeUndefined();
  });

  it("removes a user's sessions when the user is deleted (ON DELETE CASCADE)", async () => {
    const user = await createUser();
    const sessions = createSessionRepository(pool);
    const tokenHash = hashSessionToken(generateSessionToken());
    await sessions.create({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    });

    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);

    expect(await sessions.findActive(tokenHash, new Date())).toBeNull();
  });

  it("refuses a session for a user that does not exist (foreign key)", async () => {
    const sessions = createSessionRepository(pool);

    await expect(
      sessions.create({
        tokenHash: hashSessionToken(generateSessionToken()),
        userId: "00000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      }),
    ).rejects.toThrow(/sessions_user_id_fkey/);
  });
});
