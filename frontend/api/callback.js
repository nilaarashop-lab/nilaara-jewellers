/**
 * Step 2 of the staff admin GitHub login.
 *
 * GitHub redirects here with a one-time code. We exchange it for a token using
 * the client secret (server-side only), then hand the token to the admin popup
 * via postMessage. The token is never committed or written to disk.
 */

const readCookie = (header, name) => {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
};

const page = (payload, status) => {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return {
    status,
    body: `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>Nilaara Admin sign-in</title>
<style>
  body { margin: 0; background: #FBF7EF; color: #650108; font: 15px/1.6 system-ui, sans-serif; }
  main { max-width: 420px; margin: 0 auto; padding: 56px 28px; text-align: center; }
  .mark { width: 48px; height: 48px; border-radius: 50%; background: #650108; color: #F3D9A4;
          display: grid; place-items: center; margin: 0 auto 18px; font: 600 22px/1 Georgia, serif; }
  h1 { font: 400 28px/1.2 Georgia, serif; margin: 0 0 8px; }
  p { color: #6B5B4E; margin: 0; }
</style>
</head>
<body>
<main>
  <div class="mark">N</div>
  <h1 id="title">Finishing sign-in…</h1>
  <p id="status">You can close this window when it finishes.</p>
</main>
<script>
(function () {
  var payload = ${serialized};
  var target = window.location.origin;

  function show(title, text) {
    document.getElementById("title").textContent = title;
    document.getElementById("status").textContent = text;
  }

  if (window.opener) {
    window.opener.postMessage(payload, target);
    if (payload.ok) {
      show("Signed in", "Returning to the admin…");
      setTimeout(function () { window.close(); }, 500);
    } else {
      show("Sign-in failed", payload.error || "Close this window and try again.");
    }
  } else if (payload.ok) {
    show("Signed in", "Open the admin page to continue.");
  } else {
    show("Sign-in failed", payload.error || "Open the admin page and try again.");
  }
})();
</script>
</body></html>`,
  };
};

const html = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const secure = String(res.req?.headers?.["x-forwarded-proto"] || "").startsWith("https");
  res.setHeader(
    "Set-Cookie",
    `nilaara_admin_oauth_state=; Path=/api; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`
  );
  res.end(body);
};

const send = (res, status, payload) => {
  const output = page(payload, status);
  html(res, output.status, output.body);
};

export default async function handler(req, res) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    send(res, 500, {
      type: "nilaara-admin-auth",
      ok: false,
      error: "Admin login is not configured: set the GitHub OAuth environment variables in Vercel.",
    });
    return;
  }

  const url = new URL(req.url, "https://nilaara.invalid");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const expectedState = readCookie(req.headers.cookie, "nilaara_admin_oauth_state");

  if (oauthError) {
    send(res, 400, {
      type: "nilaara-admin-auth",
      ok: false,
      error: oauthError === "access_denied" ? "GitHub sign-in was cancelled." : "GitHub could not sign you in.",
    });
    return;
  }
  if (!code) {
    send(res, 400, {
      type: "nilaara-admin-auth",
      ok: false,
      error: "GitHub did not return an authorization code.",
    });
    return;
  }
  if (!state || !expectedState || state !== expectedState) {
    send(res, 400, {
      type: "nilaara-admin-auth",
      ok: false,
      error: "Login state did not match. Please try again.",
    });
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
    send(res, 200, {
      type: "nilaara-admin-auth",
      ok: true,
      token: data.access_token,
    });
  } catch (err) {
    send(res, 502, {
      type: "nilaara-admin-auth",
      ok: false,
      error: err.message || "Could not complete GitHub login.",
    });
  }
}
