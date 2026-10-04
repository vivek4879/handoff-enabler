import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSessionStore, createFakeUserStore, fakeHasher } from "../testing/fakeStores.js";
import { EmailAlreadyRegisteredError } from "../users/errors.js";
import { createAuthService, SESSION_LIFETIME_MS, type PasswordHasher } from "./authService.js";
import { InvalidCredentialsError, ValidationError } from "./errors.js";

// These tests use in-memory fakes for the database and a fake password hasher,
// so they run in microseconds and need no Postgres. What they check is the
// service's RULES. (The SQL itself is covered by the repository tests.)

function buildService(passwordHasher: PasswordHasher = fakeHasher) {
  const clock = { current: new Date("2030-01-01T00:00:00Z") };
  const users = createFakeUserStore();
  const sessions = createFakeSessionStore();
  const service = createAuthService({ users, sessions, now: () => clock.current, passwordHasher });
  return { service, users, clock };
}

const ada = { email: "ada@example.com", password: "correct horse battery", role: "creator" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signup", () => {
  it("creates the user, lowercases the email, and returns a public user without the hash", async () => {
    const { service } = buildService();

    const result = await service.signup({ ...ada, email: "  Ada@Example.com " });

    expect(result.user).toEqual({ id: expect.any(String), email: "ada@example.com", role: "creator" });
    // The password hash must never leave the service.
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("stores a hash, never the plain password", async () => {
    const { service, users } = buildService();

    await service.signup(ada);

    const stored = await users.findByEmail("ada@example.com");
    expect(stored?.passwordHash).not.toBe(ada.password);
    expect(stored?.passwordHash).toBe("fake-hash:correct horse battery");
  });

  it("stores a real argon2id hash when the real hasher is used", async () => {
    const clock = { current: new Date("2030-01-01T00:00:00Z") };
    const users = createFakeUserStore();
    const service = createAuthService({ users, sessions: createFakeSessionStore(), now: () => clock.current });

    await service.signup(ada);

    expect((await users.findByEmail("ada@example.com"))?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("starts a session that expires after the session lifetime", async () => {
    const { service, clock } = buildService();

    const result = await service.signup(ada);

    expect(result.expiresAt.getTime()).toBe(clock.current.getTime() + SESSION_LIFETIME_MS);
    expect((await service.getSessionUser(result.sessionToken))?.email).toBe("ada@example.com");
  });

  it("rejects a second signup with the same email, whatever its capitalisation", async () => {
    const { service } = buildService();
    await service.signup(ada);

    await expect(service.signup({ ...ada, email: "ADA@example.com" })).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it("rejects invalid input with a ValidationError before touching storage", async () => {
    const { service, users } = buildService();

    await expect(service.signup({ ...ada, password: "short" })).rejects.toBeInstanceOf(ValidationError);
    expect(await users.findByEmail("ada@example.com")).toBeNull();
  });
});

describe("login", () => {
  it("starts a session for the right email and password", async () => {
    const { service } = buildService();
    await service.signup(ada);

    const result = await service.login({ email: "ada@example.com", password: ada.password });

    expect(result.user.email).toBe("ada@example.com");
    expect((await service.getSessionUser(result.sessionToken))?.role).toBe("creator");
  });

  it("ignores capitalisation and surrounding spaces in the email", async () => {
    const { service } = buildService();
    await service.signup(ada);

    await expect(service.login({ email: "  ADA@Example.com ", password: ada.password })).resolves.toBeDefined();
  });

  it("fails with InvalidCredentialsError for a wrong password", async () => {
    const { service } = buildService();
    await service.signup(ada);

    await expect(service.login({ email: "ada@example.com", password: "wrong password" })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it("gives the identical error for an unknown email as for a wrong password", async () => {
    const { service } = buildService();
    await service.signup(ada);

    const wrongPassword = await service
      .login({ email: "ada@example.com", password: "wrong password" })
      .catch((error: unknown) => error);
    const unknownEmail = await service
      .login({ email: "nobody@example.com", password: "wrong password" })
      .catch((error: unknown) => error);

    // Same type and same message: a client cannot tell which emails exist.
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
  });

  it("still checks a password hash when the email is unknown (so timing does not leak)", async () => {
    const verify = vi.fn(async () => false);
    const { service } = buildService({ hash: fakeHasher.hash, verify });

    await expect(service.login({ email: "nobody@example.com", password: "whatever1" })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("logs a corrupted stored hash and answers like any failed login", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenHasher: PasswordHasher = {
      hash: fakeHasher.hash,
      verify: async () => {
        throw new Error("Decoding failed");
      },
    };
    const { service } = buildService(brokenHasher);
    await service.signup(ada);

    await expect(service.login({ email: "ada@example.com", password: ada.password })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );

    // We hear about it...
    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = String(errorLog.mock.calls[0]?.[0]);
    expect(logged).toContain("stored password hash could not be verified");
    // ...without the password or the hash ever being written to the log.
    expect(logged).not.toContain(ada.password);
    expect(logged).not.toContain("fake-hash");
  });

  it("rejects missing fields with a ValidationError", async () => {
    const { service } = buildService();

    await expect(service.login({ email: "ada@example.com" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getSessionUser", () => {
  it("returns null for a missing or unknown token", async () => {
    const { service } = buildService();

    expect(await service.getSessionUser(null)).toBeNull();
    expect(await service.getSessionUser("not-a-real-token")).toBeNull();
  });

  it("returns null once the session has expired", async () => {
    const { service, clock } = buildService();
    const { sessionToken } = await service.signup(ada);

    clock.current = new Date(clock.current.getTime() + SESSION_LIFETIME_MS + 1);

    expect(await service.getSessionUser(sessionToken)).toBeNull();
  });

  it("does not expose the password hash", async () => {
    const { service } = buildService();
    const { sessionToken } = await service.signup(ada);

    expect(await service.getSessionUser(sessionToken)).not.toHaveProperty("passwordHash");
  });
});

describe("logout", () => {
  it("ends the session on the server", async () => {
    const { service } = buildService();
    const { sessionToken } = await service.signup(ada);

    await service.logout(sessionToken);

    expect(await service.getSessionUser(sessionToken)).toBeNull();
  });

  it("succeeds when there is no session to end", async () => {
    const { service } = buildService();

    await expect(service.logout(null)).resolves.toBeUndefined();
    await expect(service.logout("stale-token")).resolves.toBeUndefined();
  });

  it("leaves other sessions of the same user alone", async () => {
    const { service } = buildService();
    const first = await service.signup(ada);
    const second = await service.login({ email: ada.email, password: ada.password });

    await service.logout(first.sessionToken);

    expect(await service.getSessionUser(first.sessionToken)).toBeNull();
    expect(await service.getSessionUser(second.sessionToken)).not.toBeNull();
  });
});
