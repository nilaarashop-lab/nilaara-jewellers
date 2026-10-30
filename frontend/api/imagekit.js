import crypto from "node:crypto";

/**
 * ImageKit access for the admin photo workflow.
 *
 * The private key never reaches the browser: this function signs a short-lived
 * token that the admin sends to ImageKit's upload API with the file, and lists
 * or deletes files when the admin tidies up. Requests must carry the staff
 * member's GitHub token, and that token must have push access to the catalogue
 * repo, so a stranger cannot use the endpoint to fill or empty the ImageKit
 * account.
 *
 * Actions: "sign" (default), "list", "delete".
 *
 * With IMAGEKIT_PRIVATE_KEY / IMAGEKIT_PUBLIC_KEY absent the endpoint answers
 * { configured: false } and the admin keeps committing uploads to the repo.
 */

export const AUTH_TTL_SECONDS = 600;
export const IMAGEKIT_FOLDER = "/nilaara/products";
const DEFAULT_REPO = "nilaarashop-lab/nilaara-jewellers";
const DEFAULT_URL_ENDPOINT = "https://ik.imagekit.io/w4bq6axnq";
const IMAGEKIT_FILES_API = "https://api.imagekit.io/v1/files";
const LIST_PAGE_SIZE = 100;

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

const failure = (status, message) => Object.assign(new Error(message), { status });

/** ImageKit's management API uses HTTP Basic: private key as username. */
const basicAuth = (privateKey) => `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;

const readBody = (req) => {
  if (!req?.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
};

const photo = (file) => ({
  path: String(file?.filePath || ""),
  url: String(file?.url || ""),
  name: String(file?.name || ""),
  size: Number(file?.size) || 0,
  createdAt: String(file?.createdAt || ""),
});

/** Every photo in the storefront folder, oldest API page first. */
export async function listFolderPhotos({ privateKey, folder = IMAGEKIT_FOLDER, fetchImpl = fetch }) {
  const photos = [];
  for (let skip = 0; skip < 5000; skip += LIST_PAGE_SIZE) {
    let res;
    try {
      res = await fetchImpl(
        `${IMAGEKIT_FILES_API}?path=${encodeURIComponent(folder)}&limit=${LIST_PAGE_SIZE}&skip=${skip}`,
        { headers: { Authorization: basicAuth(privateKey) } }
      );
    } catch {
      throw failure(502, "Couldn't reach ImageKit. Check your internet connection and try again.");
    }
    if (!res.ok) throw failure(502, `ImageKit couldn't list photos (${res.status}).`);
    const page = await res.json().catch(() => null);
    if (!Array.isArray(page)) throw failure(502, "ImageKit returned an unexpected photo list.");
    photos.push(...page.map(photo));
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return photos;
}

/** Only files this storefront uploaded may be deleted, never anything else. */
export function isManagedPhotoPath(path) {
  return (
    typeof path === "string" &&
    path.startsWith(`${IMAGEKIT_FOLDER}/`) &&
    !path.split("/").includes("..")
  );
}

export async function deletePhoto({ privateKey, filePath, fetchImpl = fetch }) {
  if (!isManagedPhotoPath(filePath)) throw failure(400, "That photo is not in the storefront folder.");
  let res;
  try {
    res = await fetchImpl(`${IMAGEKIT_FILES_API}?filePath=${encodeURIComponent(filePath)}`, {
      method: "DELETE",
      headers: { Authorization: basicAuth(privateKey) },
    });
  } catch {
    throw failure(502, "Couldn't reach ImageKit. Check your internet connection and try again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw failure(502, data?.message || `ImageKit couldn't delete that photo (${res.status}).`);
  }
  return { deleted: filePath };
}

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
  if (!token) return send(res, 401, { message: "Sign in with GitHub again to manage photos." });
  if (!(await canPushCatalogue(token))) {
    return send(res, 403, { message: "This GitHub account cannot manage the shop's photos." });
  }

  const body = readBody(req);
  const action = body.action || "sign";

  try {
    if (action === "list") {
      const files = await listFolderPhotos({ privateKey });
      return send(res, 200, { configured: true, folder: IMAGEKIT_FOLDER, files });
    }
    if (action === "delete") {
      return send(res, 200, { configured: true, ...(await deletePhoto({ privateKey, filePath: body.filePath })) });
    }
  } catch (ex) {
    return send(res, ex.status || 502, { message: ex.message || "ImageKit couldn't complete that request." });
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
