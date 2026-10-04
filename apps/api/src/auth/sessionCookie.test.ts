import { describe, expect, it } from "vitest";
import {
  clearedSessionCookieOptions,
  readSessionToken,
  sessionCookieOptions,
} from "./sessionCookie.js";

describe("sessionCookieOptions", () => {
  it("is HttpOnly, SameSite=Lax, site-wide, and expires when the session does", () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");

    expect(sessionCookieOptions(expiresAt, true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: expiresAt,
    });
  });

  it("only sets Secure when asked to (production)", () => {
    expect(sessionCookieOptions(new Date(), false).secure).toBe(false);
  });
});

describe("clearedSessionCookieOptions", () => {
  it("uses the same flags as when the cookie was set, without an expiry", () => {
    // The browser only removes a cookie when name, path and flags match.
    expect(clearedSessionCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });
});

describe("readSessionToken", () => {
  it("returns the value of the session cookie", () => {
    expect(readSessionToken("session=abc123")).toBe("abc123");
  });

  it("finds it among other cookies, ignoring spaces", () => {
    expect(readSessionToken("theme=dark; session=abc123 ; lang=en")).toBe("abc123");
  });

  it("does not mistake a cookie whose name merely ends with 'session'", () => {
    expect(readSessionToken("othersession=wrong")).toBeNull();
  });

  it("returns null when there is no cookie header", () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("")).toBeNull();
  });

  it("returns null when the session cookie is absent or empty", () => {
    expect(readSessionToken("theme=dark")).toBeNull();
    expect(readSessionToken("session=")).toBeNull();
  });

  it("ignores malformed parts instead of failing", () => {
    expect(readSessionToken("garbage; session=abc123")).toBe("abc123");
  });
});
