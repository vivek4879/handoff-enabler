import type { Role } from "../users/user.js";
import { ValidationError } from "./errors.js";

const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 10;
// An upper limit stops someone from making us run an expensive hash on a huge
// input (a cheap way to slow the server down).
export const PASSWORD_MAX_LENGTH = 128;

const ROLES: readonly Role[] = ["client", "creator"];

export type SignupInput = { email: string; password: string; role: Role };
export type LoginInput = { email: string; password: string };

// Emails are compared and stored in this form, so "Ada@Example.com " and
// "ada@example.com" are the same account. The database also enforces lowercase.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// A deliberately simple check: something@something.tld with no spaces. Real
// validity is proven by sending an email, not by a pattern.
function isPlausibleEmail(email: string): boolean {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || /\s/.test(email)) {
    return false;
  }
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) {
    return false;
  }
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

// Request bodies arrive as `unknown`: we have not checked anything about them.
// The cast below is safe because we check every field's type before using it.
function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError({ body: "request body must be a JSON object" });
  }
  return input as Record<string, unknown>;
}

export function parseSignupInput(input: unknown): SignupInput {
  const body = asRecord(input);
  const fields: Record<string, string> = {};

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isPlausibleEmail(email)) {
    fields.email = "enter a valid email address";
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    fields.password = `password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`;
  }

  const role = ROLES.find((candidate) => candidate === body.role);
  if (!role) {
    fields.role = "role must be client or creator";
  }

  if (Object.keys(fields).length > 0 || !role) {
    throw new ValidationError(fields);
  }
  return { email, password, role };
}

// Login only checks that the fields are present and sane. It does NOT check the
// email format or the minimum length: a login for a malformed email just fails
// like any other wrong login, and tells an attacker nothing.
export function parseLoginInput(input: unknown): LoginInput {
  const body = asRecord(input);
  const fields: Record<string, string> = {};

  if (typeof body.email !== "string" || body.email.length === 0) {
    fields.email = "email is required";
  }
  if (
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    body.password.length > PASSWORD_MAX_LENGTH
  ) {
    fields.password = "password is required";
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }
  return { email: normalizeEmail(body.email as string), password: body.password as string };
}
