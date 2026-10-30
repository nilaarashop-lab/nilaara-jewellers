/**
 * Step 2 of the staff CMS GitHub login.
 *
 * GitHub redirects here with a one-time code. We exchange it for a token using
 * the client secret (server-side only), then hand the token to the Decap popup
 * via postMessage. The token is never committed or written to disk.
 */

const readCookie = (header, name) => {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
};

const page = (script) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Nilaara CMS login</title></head>
<body style="font:15px/1.6 system-ui,sans-serif;color:#650108;padding:32px">
<p id="status">Finishing sign-in…</p>
<script>${script}</script>
</body></html>`;

const html = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
};

const sendMessage = (res, status, message) => {
  const serialized = JSON.stringify(message).replace(/</g, "\\u003c");
  html(
    res,
    status,
    page(`
(function () {
  var message = ${serialized};
  function receive(e) {
    if (window.opener) window.opener.postMessage(message, e.origin || "*");
    window.removeEventListener("message", receive, false);
    document.getElementById("status").textContent = "Signed in. You can close this window.";
    setTimeout(function () { window.close(); }, 250);
  }
  window.addEventListener("message", receive, false);
  if (window.opener) window.opener.postMessage("authorizing:github", "*");
})();
`)
  );
};

export default async function handler(req, res) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    html(res, 500, "CMS login is not configured: set the GitHub OAuth environment variables in Vercel.");
    return;
  }

  const url = new URL(req.url, "https://nilaara.invalid");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(req.headers.cookie, "decap_oauth_state");

  if (!code) {
    sendMessage(res, 400, `authorization:github:error:${JSON.stringify({ message: "GitHub did not return an authorization code." })}`);
    return;
  }
  if (!state || !expectedState || state !== expectedState) {
    sendMessage(res, 400, `authorization:github:error:${JSON.stringify({ message: "Login state did not match. Please try again." })}`);
    return;
  }

  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let origin;
  try {
    origin = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : `${proto}://${host}`;
  } catch {
    origin = `${proto}://${host}`;
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/callback`,
      }),
    });
    const data = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `GitHub returned ${tokenRes.status}.`);
    }
    sendMessage(
      res,
      200,
      `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: "github" })}`
    );
  } catch (err) {
    sendMessage(
      res,
      502,
      `authorization:github:error:${JSON.stringify({ message: err.message || "Could not complete GitHub login." })}`
    );
  }
}
