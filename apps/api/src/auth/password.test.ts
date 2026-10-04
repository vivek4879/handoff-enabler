import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

// Each hash is slow on purpose (that is what makes stolen hashes hard to
// crack), so these tests take tens of milliseconds each, not microseconds.

describe("hashPassword", () => {
  it("does not return the plain password and produces an argon2id hash", async () => {
    const hashed = await hashPassword("correct horse battery staple");

    // The whole point: the stored value must never be the password itself.
    expect(hashed).not.toContain("correct horse battery staple");
    // The "$argon2id$" prefix records which algorithm made the hash. The rest
    // of the string also records the settings and the random salt.
    expect(hashed.startsWith("$argon2id$")).toBe(true);
  });

  it("produces a different hash each time for the same password", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    // Each call mixes in a fresh random salt. That means two users with the
    // same password get different hashes, so an attacker cannot spot them
    // (or reuse precomputed tables of hashes).
    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const stored = await hashPassword("right password");

    expect(await verifyPassword("right password", stored)).toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const stored = await hashPassword("right password");

    // A wrong password is a normal, expected outcome, so it is `false`,
    // not an error.
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("verifies against a hash made by an earlier call (salt is read from the hash)", async () => {
    // verifyPassword is given only the plain password and the stored string.
    // There is no separate salt column: the salt lives inside the hash string.
    const stored = await hashPassword("remember me");

    expect(await verifyPassword("remember me", stored)).toBe(true);
    expect(await verifyPassword("Remember me", stored)).toBe(false);
  });

  it("throws when the stored hash is corrupted instead of returning false", async () => {
    // A broken hash in the database is a bug, not a wrong password. Returning
    // `false` would hide it: the user could never log in and nobody would know
    // why. The caller (the login service) decides how to log and respond.
    await expect(verifyPassword("whatever", "not-a-hash")).rejects.toThrow();
  });
});
