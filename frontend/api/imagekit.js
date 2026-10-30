import crypto from "node:crypto";

/**
 * ImageKit upload authorisation for the admin photo workflow.
 *
 * The private key never reaches the browser: this function signs a short-lived
 * token that the admin sends to ImageKit's upload API with the file. Requests
 * must carry the staff member's GitHub token, and that token must have push
 * access to the catalogue repo, so a stranger cannot use the endpoint to fill
 * the ImageKit account.
 *
 * With IMAGEKIT_PRIVATE_KEY / IMAGEKIT_PUBLIC_KEY absent the endpoint answers
 * { configured: false } and the admin keeps committing uploads to the repo.
 */

export const AUTH_TTL_SECONDS = 600;
const DEFAULT_REPO = "nilaarashop-lab/nilaara-jewellers";
const DEFAULT_URL_ENDPOINT = "https://ik.imagekit.io/w4bq6axnq";

/** ImageKit expects signature = HMAC-SHA1(privateKey, token + expire), hex. */
export function uploadAuth(
  { privateKey, publicKey, urlEndpoint },
  { now = Date.now(), token = crypto.randomBytes(16).toString("hex") } = {}
) {
  const expire = Math.floor(now / 1000) + AUTH_TTL_SECONDS;
  const signature = crypto.createHmac("sha1", privateKey).update(`${token}${expire}`).digest("hex");
  return {
    configured: true,
    token,
    expire,
    signature,
    publicKey,
    urlEndpoint: String(urlEndpoint || DEFAULT_URL_ENDPOINT).replace(/\/+$/, ""),
  };
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

async function canPushCatalogue(token) {
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "nilaara-admin",
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.permissions?.push === true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { message: "Use POST." });

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  if (!privateKey || !publicKey) return send(res, 200, { configured: false });

  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return send(res, 401, { message: "Sign in with GitHub again to upload photos." });
  if (!(await canPushCatalogue(token))) {
    return send(res, 403, { message: "This GitHub account cannot add photos to the catalogue." });
  }

  return send(
    res,
    200,
    uploadAuth({
      privateKey,
      publicKey,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || DEFAULT_URL_ENDPOINT,
    })
  );
}
