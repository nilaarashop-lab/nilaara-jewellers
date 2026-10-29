/** Central error handling: consistent JSON errors, no stack traces to clients. */
const env = require("../config/env");
const { HttpError } = require("../lib/apiError");

function notFound(_req, res) {
  res.status(404).json({ error: "Not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const isDup = err && (err.code === 11000 || err.code === 11001); // unique index violation
  const isValidation = err && err.name === "ValidationError"; // mongoose schema validation
  const status = err instanceof HttpError ? err.status : err.status || (isDup ? 409 : isValidation ? 400 : 500);
  if (status >= 500) {
    console.error("[error]", new Date().toISOString(), err); // full detail server-side only
  }
  // HttpError messages are curated client-safe copy — always show them.
  // Unexpected errors get the generic message (their internals must never leak).
  const body = {
    error:
      isDup ? "Already exists — that value is taken."
      : status >= 500 && !(err instanceof HttpError) ? "Something went wrong. Please try again."
      : err.message,
  };
  if (err.details) body.details = err.details;
  if (!env.isProd && err.stack && status >= 500) body.devStack = err.stack.split("\n")[0];
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
