import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

let server: Server;

function startApp(db: { query: () => Promise<unknown> }) {
  const app = createApp({ db: db as never });
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return `http://localhost:${port}`;
}

afterEach(() => {
  server.close();
});

describe("GET /health", () => {
  it("returns 200 when the database answers", async () => {
    const baseUrl = startApp({ query: async () => ({}) });

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "connected" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const baseUrl = startApp({
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
    const baseUrl = startApp({ query: async () => ({}) });

    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });
});
