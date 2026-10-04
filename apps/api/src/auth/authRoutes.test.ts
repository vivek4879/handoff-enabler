import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createFakeSessionStore, createFakeUserStore, fakeHasher } from "../testing/fakeStores.js";
import { startTestServer, type TestServer } from "../testing/testServer.js";
import { createAuthService } from "./authService.js";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "./middleware.js";
import { SESSION_COOKIE_NAME } from "./sessionCookie.js";

// Full HTTP round trips through the real app, with in-memory storage. These
// check what a browser would actually see: status codes, bodies, and the
// Set-Cookie header.

let testServer: TestServer | undefined;

type StartOptions = {
  secureCookies?: boolean;
  authOverrides?: Record<string, unknown>;
};

async function start({ secureCookies = false, authOverrides = {} }: StartOptions = {}) {
  const realAuth = createAuthService({
    users: createFakeUserStore(),
    sessions: createFakeSessionStore(),
    passwordHasher: fakeHasher,
  });
  const auth = { ...realAuth, ...authOverrides } as typeof realAuth;
  const app = createApp({ db: { query: async () => ({}) } as never, auth, secureCookies });
  testServer = await startTestServer(app);
  return testServer.baseUrl;
}

afterEach(async () => {
  await testServer?.close();
  testServer = undefined;
  vi.restoreAllMocks();
});

const ada = { email: "ada@example.com", password: "correct horse battery", role: "client" };

function post(baseUrl: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// The raw Set-Cookie header line for the session cookie, or undefined.
function sessionSetCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE_NAME}=`));
}

// What a browser would send back: just "name=value" from the Set-Cookie line.
function cookieHeaderFrom(response: Response): string {
  const line = sessionSetCookie(response);
  if (!line) {
    throw new Error("response did not set a session cookie");
  }
  return line.split(";")[0] as string;
}

describe("POST /auth/signup", () => {
  it("creates the account, logs the user in, and answers 201 with the public user", async () => {
    const baseUrl = await start();

    const response = await post(baseUrl, "/auth/signup", ada);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      user: { id: expect.any(String), email: "ada@example.com", role: "client" },
    });
    expect(sessionSetCookie(response)).toBeDefined();
  });

  it("sets a cookie that is HttpOnly, SameSite=Lax, site-wide and expiring", async () => {
    const baseUrl = await start();

    const cookie = sessionSetCookie(await post(baseUrl, "/auth/signup", ada)) as string;

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Expires=");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure when secure cookies are enabled (production)", async () => {
    const baseUrl = await start({ secureCookies: true });

    const cookie = sessionSetCookie(await post(baseUrl, "/auth/signup", ada)) as string;

    expect(cookie).toContain("Secure");
  });

  it("never puts the password, its hash, or the session token in the response body", async () => {
    const baseUrl = await start();

    const response = await post(baseUrl, "/auth/signup", ada);
    const body = await response.text();
    const token = cookieHeaderFrom(response).split("=")[1] as string;

    expect(body).not.toContain(ada.password);
    expect(body).not.toContain("fake-hash");
    expect(body).not.toContain(token);
  });

  it("answers 400 with per-field messages and sets no cookie for invalid input", async () => {
    const baseUrl = await start();

    const response = await post(baseUrl, "/auth/signup", { email: "nope", password: "short", role: "admin" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(["email", "password", "role"]);
    expect(sessionSetCookie(response)).toBeUndefined();
  });

  it("answers 409 when the email is already registered", async () => {
    const baseUrl = await start();
    await post(baseUrl, "/auth/signup", ada);

    const response = await post(baseUrl, "/auth/signup", { ...ada, email: "ADA@example.com" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "email already registered" });
    expect(sessionSetCookie(response)).toBeUndefined();
  });

  it("answers 400 for a body that is not valid JSON", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json", [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE },
      body: "{ this is not json",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid request body" });
  });

  it("answers 403 without the CSRF header, and creates nothing", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ada),
    });

    expect(response.status).toBe(403);
    expect((await post(baseUrl, "/auth/login", ada)).status).toBe(401);
  });
});

describe("POST /auth/login", () => {
  it("answers 200 with the user and a session cookie for the right credentials", async () => {
    const baseUrl = await start();
    await post(baseUrl, "/auth/signup", ada);

    const response = await post(baseUrl, "/auth/login", { email: "Ada@Example.com", password: ada.password });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: expect.any(String), email: "ada@example.com", role: "client" },
    });
    expect(sessionSetCookie(response)).toBeDefined();
  });

  it("answers 401 with the same body for a wrong password and an unknown email", async () => {
    const baseUrl = await start();
    await post(baseUrl, "/auth/signup", ada);

    const wrongPassword = await post(baseUrl, "/auth/login", { email: ada.email, password: "wrong wrong wrong" });
    const unknownEmail = await post(baseUrl, "/auth/login", { email: "who@example.com", password: "wrong wrong wrong" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
    expect(sessionSetCookie(wrongPassword)).toBeUndefined();
    expect(sessionSetCookie(unknownEmail)).toBeUndefined();
  });

  it("answers 400 when a field is missing", async () => {
    const baseUrl = await start();

    expect((await post(baseUrl, "/auth/login", { email: ada.email })).status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("answers 401 without a session cookie", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/auth/me`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication required" });
  });

  it("answers 401 for a cookie that was never issued", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: "session=forged-value" } });

    expect(response.status).toBe(401);
  });

  it("returns the logged-in user when the cookie from signup is sent back", async () => {
    const baseUrl = await start();
    const signup = await post(baseUrl, "/auth/signup", ada);

    const response = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: cookieHeaderFrom(signup) } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: expect.any(String), email: "ada@example.com", role: "client" },
    });
  });
});

describe("POST /auth/logout", () => {
  it("answers 204, tells the browser to delete the cookie, and ends the session on the server", async () => {
    const baseUrl = await start();
    const signup = await post(baseUrl, "/auth/signup", ada);
    const cookie = cookieHeaderFrom(signup);

    const logout = await post(baseUrl, "/auth/logout", undefined, { cookie });

    expect(logout.status).toBe(204);
    // The browser is told to drop the cookie: empty value, already expired.
    expect(sessionSetCookie(logout)).toMatch(/^session=;.*Expires=Thu, 01 Jan 1970/);
    // The important part: even if someone kept a copy of the old cookie, it no
    // longer works, because the session is gone from the server.
    const stolenCopy = await fetch(`${baseUrl}/auth/me`, { headers: { cookie } });
    expect(stolenCopy.status).toBe(401);
  });

  it("answers 204 even when nobody is logged in", async () => {
    const baseUrl = await start();

    expect((await post(baseUrl, "/auth/logout")).status).toBe(204);
  });

  it("answers 403 without the CSRF header, and keeps the session", async () => {
    const baseUrl = await start();
    const cookie = cookieHeaderFrom(await post(baseUrl, "/auth/signup", ada));

    const logout = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { cookie } });

    expect(logout.status).toBe(403);
    expect((await fetch(`${baseUrl}/auth/me`, { headers: { cookie } })).status).toBe(200);
  });
});

describe("unexpected failures", () => {
  it("answers 500 with a generic body, and logs the details for us only", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const baseUrl = await start({
      authOverrides: {
        signup: async () => {
          throw new Error("connection to db-primary.internal:5432 refused");
        },
      },
    });

    const response = await post(baseUrl, "/auth/signup", ada);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal error" });
    // The log has the cause; the client never sees it.
    expect(String(errorLog.mock.calls[0]?.[0])).toContain("db-primary.internal");
  });
});
