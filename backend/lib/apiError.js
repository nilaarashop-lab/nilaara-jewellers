/** Small HTTP error helper + async wrapper. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const fail = (status, message, details) => {
  throw new HttpError(status, message, details);
};

module.exports = { HttpError, asyncHandler, fail };
