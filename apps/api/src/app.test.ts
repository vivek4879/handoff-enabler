import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { startTestServer, type TestServer } from "./testing/testServer.js";

let testServer: TestServer;

async function startApp(db: { query: () => Promise<unknown> }) {
  testServer = await startTestServer(createApp({ db: db as never }));
  return testServer.baseUrl;
}

afterEach(async () => {
  await testServer.close();
});

describe("GET /health", () => {
  it("returns 200 when the database answers", async () => {
    const baseUrl = await startApp({ query: async () => ({}) });

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "connected" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const baseUrl = await startApp({
      query: async () => {
        throw new Error("connection refused");
      },
    });

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error", db: "unreachable" });
  });
});

describe("unknown routes", () => {
  it("returns 404 with a JSON error", async () => {
    const baseUrl = await startApp({ query: async () => ({}) });

    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });
});
