import { createHash, randomBytes } from "node:crypto";

// The value that goes into the browser's cookie: 32 random bytes (256 bits),
// written as URL-safe text. Math.random() must never be used for this because
// it is predictable; randomBytes uses the operating system's secure source.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// What we store in the database instead of the token itself. The same token
// always gives the same hash (so we can look a session up by it), and a leaked
// database does not contain anything that works as a cookie.
export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
