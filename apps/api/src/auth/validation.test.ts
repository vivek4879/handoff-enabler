import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors.js";
import { normalizeEmail, parseLoginInput, parseSignupInput } from "./validation.js";

const validSignup = { email: "ada@example.com", password: "a-long-enough-password", role: "client" };

// Runs the parser and returns the per-field messages it complained about.
function signupErrors(input: unknown): Record<string, string> {
  try {
    parseSignupInput(input);
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.fields;
    }
    throw error;
  }
  return {};
}

describe("normalizeEmail", () => {
  it("trims spaces and lowercases", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("parseSignupInput", () => {
  it("accepts valid input and normalizes the email", () => {
    const result = parseSignupInput({ ...validSignup, email: "  ADA@Example.com " });

    expect(result).toEqual({
      email: "ada@example.com",
      password: "a-long-enough-password",
      role: "client",
    });
  });

  it.each(["", "no-at-sign", "@example.com", "ada@", "a b@example.com", "a@@example.com", "ada@example"])(
    "rejects the email %j",
    (email) => {
      expect(signupErrors({ ...validSignup, email })).toHaveProperty("email");
    },
  );

  it("rejects a password that is too short or too long", () => {
    expect(signupErrors({ ...validSignup, password: "short" })).toHaveProperty("password");
    expect(signupErrors({ ...validSignup, password: "x".repeat(129) })).toHaveProperty("password");
  });

  it("accepts passwords at exactly the minimum and maximum length", () => {
    expect(signupErrors({ ...validSignup, password: "x".repeat(10) })).toEqual({});
    expect(signupErrors({ ...validSignup, password: "x".repeat(128) })).toEqual({});
  });

  it("rejects any role other than client or creator", () => {
    expect(signupErrors({ ...validSignup, role: "admin" })).toHaveProperty("role");
    expect(signupErrors({ ...validSignup, role: undefined })).toHaveProperty("role");
  });

  it("reports every problem at once, so a form can show them all", () => {
    expect(Object.keys(signupErrors({ email: "x", password: "y", role: "z" })).sort()).toEqual([
      "email",
      "password",
      "role",
    ]);
  });

  it("rejects values of the wrong type instead of crashing", () => {
    expect(signupErrors({ email: 42, password: ["a"], role: {} })).toHaveProperty("email");
    expect(signupErrors(null)).toHaveProperty("body");
    expect(signupErrors("a string")).toHaveProperty("body");
    expect(signupErrors([validSignup])).toHaveProperty("body");
  });
});

describe("parseLoginInput", () => {
  it("accepts an email and password and normalizes the email", () => {
    expect(parseLoginInput({ email: " Ada@Example.com", password: "whatever" })).toEqual({
      email: "ada@example.com",
      password: "whatever",
    });
  });

  it("does not apply signup's format rules, so a short password just fails to log in later", () => {
    expect(() => parseLoginInput({ email: "not-an-email", password: "x" })).not.toThrow();
  });

  it("rejects missing fields and absurdly long passwords", () => {
    expect(() => parseLoginInput({ email: "ada@example.com" })).toThrow(ValidationError);
    expect(() => parseLoginInput({ password: "x" })).toThrow(ValidationError);
    expect(() => parseLoginInput({ email: "a@b.co", password: "x".repeat(129) })).toThrow(
      ValidationError,
    );
    expect(() => parseLoginInput(undefined)).toThrow(ValidationError);
  });
});
