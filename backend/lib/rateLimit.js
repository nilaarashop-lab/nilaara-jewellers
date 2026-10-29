/**
 * Dependency-free in-memory sliding-window rate limiter.
 * Suitable for a single process. For multi-instance deployments move this
 * to Redis (e.g. rate-limit-redis) keeping the same middleware signature.
 *
 * Each limiter instance gets its own bucket namespace, so two limiters that
 * both default to keying by IP (e.g. register vs. Google sign-in) never share
 * or exhaust each other's budgets.
 */
const buckets = new Map(); // namespaced key -> [timestamps]
let limiterSeq = 0;

function createLimiter({ windowMs = 15 * 60 * 1000, max = 60, keyFn, message = "Too many requests — please try again later." } = {}) {
  const ns = `lim${++limiterSeq}`;
  // Periodic sweep so the map does not grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, list] of buckets) {
      const kept = list.filter((t) => now - t < windowMs);
      if (kept.length) buckets.set(k, kept);
      else buckets.delete(k);
    }
  }, Math.max(60_000, windowMs));
  sweep.unref?.();

  return (req, res, next) => {
    const key = `${ns}:${(keyFn ? keyFn(req) : req.ip) || req.ip}`;
    const now = Date.now();
    const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      const retryAfterSec = Math.ceil((list[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message });
    }
    list.push(now);
    buckets.set(key, list);
    next();
  };
}

/** Test helper — clears all buckets. */
function resetLimiters() {
  buckets.clear();
}

module.exports = { createLimiter, resetLimiters };
