import type { CookieOptions } from "express";

export const SESSION_COOKIE_NAME = "session";

// HttpOnly: page scripts cannot read the cookie, which limits the damage of an
// injected script (XSS). SameSite=Lax: the browser does not send it on
// cross-site POSTs, which blocks most CSRF. Secure: only sent over HTTPS (turned
// on in production; plain http://localhost cannot carry Secure cookies in every
// browser).
export function sessionCookieOptions(expiresAt: Date, secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt };
}

// To delete a cookie the browser needs the same name, path and flags it was set
// with, plus an expiry in the past (Express adds that in res.clearCookie).
export function clearedSessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

// Finds our cookie in the raw "Cookie" request header, which looks like
// "a=1; session=abc; b=2". Returns null if it is absent or empty.
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}
