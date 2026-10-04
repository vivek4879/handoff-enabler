import express, { type Request, type Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startTestServer, type TestServer } from "../testing/testServer.js";
import type { PublicUser } from "./authService.js";
import {
  authenticatedUser,
  createRequireAuth,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  requireCsrfHeader,
  requireRole,
  type SessionAuthenticator,
} from "./middleware.js";

const client: PublicUser = { id: "u1", email: "client@example.com", role: "client" };
const creator: PublicUser = { id: "u2", email: "creator@example.com", role: "creator" };

// A fake authenticator: two known cookies, everything else is "not logged in".
// It also records which tokens it was asked about.
function fakeAuthenticator() {
  const askedAbout: Array<string | null> = [];
  const authenticator: SessionAuthenticator = {
    async getSessionUser(token) {
      askedAbout.push(token);
      if (token === "client-token") return client;
      if (token === "creator-token") return creator;
      return null;
    },
  };
  return { authenticator, askedAbout };
}

// A tiny app that wires the middleware up the way the real routes will.
function buildApp(authenticator: SessionAuthenticator) {
  const requireAuth = createRequireAuth(authenticator);
  const app = express();
  app.use(express.json());
  app.use(requireCsrfHeader);

  app.get("/private", requireAuth, (_req, res) => {
    res.json({ user: authenticatedUser(res) });
  });
  app.get("/creators-only", requireAuth, requireRole("creator"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/public", (_req, res) => {
    res.json({ ok: true });
  });
  app.all("/change", requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

// Not every test starts a server (one calls the middleware directly), so the
// cleanup only closes a server that exists.
let testServer: TestServer | undefined;

async function start(authenticator: SessionAuthenticator = fakeAuthenticator().authenticator) {
  testServer = await startTestServer(buildApp(authenticator));
  return testServer.baseUrl;
}

afterEach(async () => {
  await testServer?.close();
  testServer = undefined;
});

const csrf = { [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE };

describe("requireAuth", () => {
  it("answers 401 when there is no cookie", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/private`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication required" });
  });

  it("answers 401, with the same body, for a cookie that matches no session", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/private`, { headers: { cookie: "session=forged" } });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication required" });
  });

  it("lets a valid session through and hands the user to the handler", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/private`, { headers: { cookie: "theme=dark; session=client-token" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: client });
  });

  it("looks the session up using the token from the session cookie only", async () => {
    const { authenticator, askedAbout } = fakeAuthenticator();
    const baseUrl = await start(authenticator);

    await fetch(`${baseUrl}/private`, { headers: { cookie: "other=x; session=creator-token" } });
    await fetch(`${baseUrl}/private`);

    expect(askedAbout).toEqual(["creator-token", null]);
  });

  it("does not interfere with routes that are not protected", async () => {
    const baseUrl = await start();

    expect((await fetch(`${baseUrl}/public`)).status).toBe(200);
  });
});

describe("requireRole", () => {
  it("lets a user with an allowed role through", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/creators-only`, { headers: { cookie: "session=creator-token" } });

    expect(response.status).toBe(200);
  });

  it("answers 403 (not 401) for a logged-in user with the wrong role", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/creators-only`, { headers: { cookie: "session=client-token" } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("answers 401 when nobody is logged in", async () => {
    const baseUrl = await start();

    expect((await fetch(`${baseUrl}/creators-only`)).status).toBe(401);
  });

  it("throws if it is used without requireAuth (a bug in our code, not a client error)", () => {
    const handler = requireRole("creator");
    const res = { locals: {} } as unknown as Response;

    expect(() => handler({} as Request, res, vi.fn())).toThrow(/requireAuth must run before/);
  });
});

describe("requireCsrfHeader", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects %s without the header", async (method) => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/change`, { method, headers: { cookie: "session=client-token" } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "missing or invalid CSRF header" });
  });

  it("rejects the header with the wrong value", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/change`, {
      method: "POST",
      headers: { cookie: "session=client-token", [CSRF_HEADER_NAME]: "something-else" },
    });

    expect(response.status).toBe(403);
  });

  it("allows a state-changing request that carries the header", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/change`, {
      method: "POST",
      headers: { cookie: "session=client-token", ...csrf },
    });

    expect(response.status).toBe(200);
  });

  it("does not ask for the header on safe methods like GET", async () => {
    const baseUrl = await start();

    const response = await fetch(`${baseUrl}/private`, { headers: { cookie: "session=client-token" } });

    expect(response.status).toBe(200);
  });
});
