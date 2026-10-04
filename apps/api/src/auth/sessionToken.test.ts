import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./sessionToken.js";

describe("generateSessionToken", () => {
  it("produces a 43-character URL-safe token (32 random bytes)", () => {
    const token = generateSessionToken();

    // 32 bytes written as base64url is 43 characters, and only uses letters,
    // digits, "-" and "_", so it is safe to put in a cookie without escaping.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces a different token every time", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateSessionToken()));

    // 1000 tokens, 1000 distinct values. With 256 bits of randomness a repeat
    // is not going to happen; if it did, two users could share a session.
    expect(tokens.size).toBe(1000);
  });
});

describe("hashSessionToken", () => {
  it("returns a 32-byte SHA-256 digest, the size the sessions table requires", () => {
    const hashed = hashSessionToken("some-token");

    expect(Buffer.isBuffer(hashed)).toBe(true);
    expect(hashed.length).toBe(32);
  });

  it("is deterministic: the same token always gives the same hash", () => {
    // Unlike password hashes there is no salt. That is on purpose: we find a
    // session by hashing the cookie value and searching for the result.
    const token = generateSessionToken();

    expect(hashSessionToken(token).equals(hashSessionToken(token))).toBe(true);
  });

  it("gives different hashes for different tokens", () => {
    expect(hashSessionToken("token-a").equals(hashSessionToken("token-b"))).toBe(false);
  });

  it("does not contain the token itself", () => {
    const token = generateSessionToken();

    // What is stored must not be usable as the cookie value.
    expect(hashSessionToken(token).toString("base64url")).not.toBe(token);
  });
});
