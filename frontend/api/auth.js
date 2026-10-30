import crypto from "node:crypto";

/**
 * Step 1 of the staff admin GitHub login.
 *
 * The admin opens this URL in a popup. We redirect to GitHub with a
 * short-lived, httpOnly state cookie so the callback can reject forged
 * authorization codes. The client secret never reaches the browser.
 */

const cookie = (name, value, secure, maxAge) =>
  `${name}=${value}; Path=/api; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;

const fail = (res, status, message) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
};

export default function handler(req, res) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    fail(res, 500, "Admin login is not configured: set GITHUB_OAUTH_CLIENT_ID in Vercel.");
    return;
  }

  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const configuredSite = process.env.SITE_URL;
  let origin;
  try {
    origin = configuredSite ? new URL(configuredSite).origin : `${proto}://${host}`;
  } catch {
    fail(res, 500, "SITE_URL is not a valid URL.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `${origin}/api/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "public_repo",
    state,
  });

  res.statusCode = 302;
  res.setHeader("Set-Cookie", cookie("nilaara_admin_oauth_state", state, origin.startsWith("https://"), 600));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `https://github.com/login/oauth/authorize?${params.toString()}`);
  res.end();
}
