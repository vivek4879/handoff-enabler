import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

export type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

// Starts an Express app on a free port (port 0 means "any free port, picked by
// the operating system") so tests can talk to it with fetch. Waits until the
// server is really listening, and close() waits until it has really stopped.
export async function startTestServer(app: Express): Promise<TestServer> {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
