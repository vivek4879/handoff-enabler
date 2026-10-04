import type { ErrorRequestHandler } from "express";
import { InvalidCredentialsError, ValidationError } from "./auth/errors.js";
import { EmailAlreadyRegisteredError } from "./users/errors.js";

// Express only recognises an error handler by its FOUR parameters, so the
// unused `next` has to stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Errors we expect and can explain to the client.
  if (error instanceof ValidationError) {
    res.status(400).json({ error: "invalid input", fields: error.fields });
    return;
  }
  if (error instanceof InvalidCredentialsError) {
    res.status(401).json({ error: error.message });
    return;
  }
  if (error instanceof EmailAlreadyRegisteredError) {
    res.status(409).json({ error: error.message });
    return;
  }

  // The body parser rejects bad JSON and oversized bodies with a 4xx status.
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "invalid request body" });
    return;
  }

  // Anything else is a bug or an outage. We keep the details for ourselves
  // (structured log) and tell the client nothing about the internals.
  console.error(JSON.stringify({ msg: "unhandled error", error: String(error) }));
  res.status(500).json({ error: "internal error" });
};
