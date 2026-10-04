import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, resetDatabase } from "../testing/testDatabase.js";
import { EmailAlreadyRegisteredError } from "./errors.js";
import { createUserRepository } from "./userRepository.js";

// These tests talk to a REAL Postgres (the handoff_test database). A fake
// cannot prove that our SQL is valid, that the constraints exist, or that the
// duplicate-email error code is recognised. That is exactly what we care about.

let pool: Pool;

beforeAll(() => {
  pool = createTestPool();
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  // Without this, the open connections keep the test process alive.
  await pool.end();
});

describe("userRepository.create", () => {
  it("stores the user and returns it with database-generated fields", async () => {
    const users = createUserRepository(pool);

    const created = await users.create({
      email: "ada@example.com",
      passwordHash: "hash-value",
      role: "creator",
    });

    // The id and createdAt come from the database, not from us.
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    // password_hash (SQL column) is exposed as passwordHash (our type).
    expect(created).toMatchObject({
      email: "ada@example.com",
      passwordHash: "hash-value",
      role: "creator",
    });
  });

  it("throws EmailAlreadyRegisteredError when the email is already taken", async () => {
    const users = createUserRepository(pool);
    await users.create({ email: "ada@example.com", passwordHash: "h1", role: "client" });

    // The database's UNIQUE constraint decides this, so two sign-ups at the
    // same instant cannot both succeed. The repository translates the raw
    // Postgres error into our own typed error.
    await expect(
      users.create({ email: "ada@example.com", passwordHash: "h2", role: "creator" }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("lets the database reject an email that is not lowercase", async () => {
    const users = createUserRepository(pool);

    // The service lowercases emails before they get here. This proves the
    // database's CHECK constraint is a safety net if some code path forgets.
    // It is NOT mapped to EmailAlreadyRegisteredError: it is a different failure.
    const attempt = users.create({ email: "Ada@Example.com", passwordHash: "h", role: "client" });

    await expect(attempt).rejects.toThrow(/users_email_lowercase/);
    await expect(attempt).rejects.not.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("treats SQL-looking input as plain text (parameterized queries)", async () => {
    const users = createUserRepository(pool);
    const hostileEmail = "x'; drop table users; --@example.com";

    // If the query were built by gluing strings together, this input would
    // change the SQL and could drop the table. With $1, $2, $3 placeholders the
    // value travels separately from the SQL, so it is just an odd email string.
    await users.create({ email: hostileEmail, passwordHash: "h", role: "client" });

    const found = await users.findByEmail(hostileEmail);
    expect(found?.email).toBe(hostileEmail);
    // The table still exists and still has exactly our one row.
    const count = await pool.query("SELECT count(*)::int AS n FROM users");
    expect(count.rows[0].n).toBe(1);
  });
});

describe("userRepository.findByEmail", () => {
  it("returns the stored user for a known email", async () => {
    const users = createUserRepository(pool);
    const created = await users.create({
      email: "ada@example.com",
      passwordHash: "hash-value",
      role: "client",
    });

    const found = await users.findByEmail("ada@example.com");

    expect(found).toEqual(created);
  });

  it("returns null for an unknown email instead of throwing", async () => {
    const users = createUserRepository(pool);

    // "No such user" is a normal outcome (for example a mistyped login), so
    // the caller gets null, not an exception.
    expect(await users.findByEmail("nobody@example.com")).toBeNull();
  });
});
