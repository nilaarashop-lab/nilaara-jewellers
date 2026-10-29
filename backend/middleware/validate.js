/** Zod-based request validation middleware. */
const { fail } = require("../lib/apiError");

/**
 * validate(schema, source = "body")
 * Validates req[source] against a Zod schema; replaces it with parsed (coerced, stripped) data.
 */
const validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(
      Object.assign(new Error("Invalid request."), {
        status: 400,
        details: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      })
    );
  }
  req[source] = result.data; // whitelist: only schema fields survive
  next();
};

module.exports = { validate };
