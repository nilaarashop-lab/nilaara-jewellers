/**
 * GitHub-backed content API for the staff admin.
 *
 * The site is static: there is no content server or database. Staff sign in
 * with GitHub, and this module reads/writes the JSON catalogue through GitHub's
 * Contents API. Every save is a commit on `main`; the storefront reads the
 * latest committed JSON on page load, and the commit also refreshes the
 * bundled fallback on the next Vercel build. Images are committed to
 * `frontend/public/uploads`.
 */

import { BRANCH, REPO, mediaUrl, notifyContentUpdated } from "../data/repo.js";

export { BRANCH, REPO };
export const PRODUCTS_PATH = "frontend/src/content/products.json";
export const SETTINGS_PATH = "frontend/src/content/settings.json";
export const UPLOADS_DIR = "frontend/public/uploads";

/**
 * Archive branch for photos and product snapshots. It is never deployed,
 * never served to shoppers, and nothing in the admin deletes from it, so a
 * photo lost from the photo service or a product deleted by mistake can be
 * recovered from here.
 */
export const BACKUP_BRANCH = "backups";
export const BACKUP_DIR = "backups";

const TOKEN_KEY = "nilaara-admin-token";
const API_ROOT = "https://api.github.com";

export class GitHubError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.details = details;
  }
}

/* ── Session token ────────────────────────────────────────────────────── */

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const setToken = (token) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
};

export const clearToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
};

/* ── Low-level GitHub request ─────────────────────────────────────────── */

const encodedPath = (path) => path.split("/").map(encodeURIComponent).join("/");

export const NETWORK_ERROR = "Couldn't reach GitHub. Check your internet connection and try again.";

const errorMessage = (status, data, requestId = "") => {
  const ref = requestId ? ` GitHub reference: ${requestId}.` : "";
  if (status === 401) return "Your GitHub session expired. Please sign in again.";
  if (status === 403) return "GitHub refused the change. Check that this account has write access to the repository.";
  if (status === 404) return "The content file was not found in the repository.";
  if (status === 409) return "Someone else changed this content since you loaded it. Refresh and try again.";
  if (status === 422) return "GitHub rejected the change. Refresh the page and try again.";
  if (status >= 500) {
    return `GitHub had a temporary server error (${status}) — this is on GitHub's side, not your photo. Wait a minute and try again.${ref}`;
  }
  return data?.message || `GitHub returned ${status}.`;
};

const sendRequest = async (path, { method, body, token }) => {
  let res;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError(NETWORK_ERROR, 0);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const requestId = res.headers?.get?.("x-github-request-id") || "";
    if (res.status === 401) clearToken();
    throw new GitHubError(errorMessage(res.status, data, requestId), res.status, {
      errors: data.errors || null,
      requestId,
    });
  }
  return data;
};

/** Delay before retry N; also makes the wait injectable for tests. */
export const retryDelay = (attempt) => 700 * attempt;

/**
 * `attempts` > 1 retries server errors and dropped connections. Only pass it
 * for writes that are safe to repeat (uploads use a unique path per call).
 */
export async function githubRequest(path, { method = "GET", body, token = getToken(), attempts = 1 } = {}) {
  if (!token) throw new GitHubError("Sign in with GitHub to continue.", 401);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sendRequest(path, { method, body, token });
    } catch (ex) {
      const temporary = ex instanceof GitHubError && (ex.status === 0 || ex.status >= 500);
      if (!temporary || attempt >= attempts) throw ex;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }
}

/* ── Base64 (UTF-8 safe) ──────────────────────────────────────────────── */

export function decodeBase64Utf8(base64) {
  const binary = atob(String(base64 || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* ── Account / permission check ───────────────────────────────────────── */

export async function getSession(token = getToken()) {
  if (!token) return null;
  const [user, repo] = await Promise.all([
    githubRequest("/user", { token }),
    githubRequest(`/repos/${REPO}`, { token }),
  ]);
  if (repo?.permissions && repo.permissions.push === false) {
    throw new GitHubError(
      "This GitHub account can read the repository but cannot publish changes. Ask the repository owner for write access.",
      403
    );
  }
  return { token, user, repo };
}

/* ── OAuth popup ──────────────────────────────────────────────────────── */

export function loginWithGitHub() {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      "/api/auth",
      "nilaara-admin-auth",
      "popup=yes,width=520,height=700,left=200,top=80"
    );
    if (!popup) {
      reject(new Error("The GitHub login window was blocked. Allow pop-ups for this site and try again."));
      return;
    }

    let settled = false;
    const origin = window.location.origin;

    const finish = () => {
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(watcher);
      clearTimeout(timeout);
      try {
        popup.close();
      } catch {
        /* already closed */
      }
    };

    const onMessage = (event) => {
      if (event.origin !== origin) return;
      const data = event.data;
      if (!data || data.type !== "nilaara-admin-auth") return;
      finish();
      if (data.ok && data.token) resolve(data.token);
      else reject(new Error(data.error || "GitHub login did not complete."));
    };

    const watcher = setInterval(() => {
      if (popup.closed && !settled) {
        finish();
        reject(new Error("The GitHub login window closed before sign-in finished. Please try again."));
      }
    }, 700);

    const timeout = setTimeout(() => {
      if (settled) return;
      finish();
      reject(new Error("GitHub login timed out. Please try again."));
    }, 120000);

    window.addEventListener("message", onMessage);
  });
}

/* ── JSON content ─────────────────────────────────────────────────────── */

async function loadFile(path, token = getToken()) {
  const data = await githubRequest(
    `/repos/${REPO}/contents/${encodedPath(path)}?ref=${encodeURIComponent(BRANCH)}`,
    { token }
  );
  if (!data || data.type !== "file" || !data.content) {
    throw new GitHubError("Could not read the content file from GitHub.");
  }
  return { text: decodeBase64Utf8(data.content), sha: data.sha, path: data.path };
}

async function saveFile(path, text, message, sha, token = getToken()) {
  const body = {
    message,
    content: encodeBase64Utf8(text),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const data = await githubRequest(`/repos/${REPO}/contents/${encodedPath(path)}`, {
    method: "PUT",
    body,
    token,
  });
  const result = { sha: data?.content?.sha || "", commit: data?.commit?.sha || "" };
  // Let any storefront tab on this device pick up the save right away.
  notifyContentUpdated(result.commit);
  return result;
}

export async function loadCatalogue(token = getToken()) {
  const file = await loadFile(PRODUCTS_PATH, token);
  let doc;
  try {
    doc = JSON.parse(file.text);
  } catch {
    throw new GitHubError("products.json is not valid JSON.");
  }
  if (!Array.isArray(doc.products)) {
    throw new GitHubError("products.json is missing its products array.");
  }
  return { doc, sha: file.sha };
}

export async function saveCatalogue(doc, sha, message, token = getToken()) {
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  return saveFile(PRODUCTS_PATH, text, message, sha, token);
}

export async function loadSettings(token = getToken()) {
  const file = await loadFile(SETTINGS_PATH, token);
  let doc;
  try {
    doc = JSON.parse(file.text);
  } catch {
    throw new GitHubError("settings.json is not valid JSON.");
  }
  return { doc, sha: file.sha };
}

export async function saveSettings(doc, sha, message, token = getToken()) {
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  return saveFile(SETTINGS_PATH, text, message, sha, token);
}

/* ── Backups ──────────────────────────────────────────────────────────── */

let backupBranchReady = null;

/** Creates the backup branch from main the first time it is needed. */
async function ensureBackupBranch(token = getToken()) {
  if (!backupBranchReady) {
    backupBranchReady = (async () => {
      try {
        await githubRequest(`/repos/${REPO}/git/ref/heads/${BACKUP_BRANCH}`, { token });
        return;
      } catch (ex) {
        if (!(ex instanceof GitHubError) || ex.status !== 404) throw ex;
      }
      const main = await githubRequest(`/repos/${REPO}/git/ref/heads/${BRANCH}`, { token });
      const sha = main?.object?.sha;
      if (!sha) throw new GitHubError("GitHub did not return the branch to copy for backups.");
      try {
        await githubRequest(`/repos/${REPO}/git/refs`, {
          method: "POST",
          token,
          body: { ref: `refs/heads/${BACKUP_BRANCH}`, sha },
        });
      } catch (ex) {
        // A parallel upload may have created it first.
        if (!(ex instanceof GitHubError) || ex.status !== 422) throw ex;
      }
    })().catch((ex) => {
      backupBranchReady = null;
      throw ex;
    });
  }
  return backupBranchReady;
}

async function backupFile(path, base64, message, token) {
  await ensureBackupBranch(token);
  try {
    await githubRequest(`/repos/${REPO}/contents/${encodedPath(path)}`, {
      method: "PUT",
      token,
      attempts: 2,
      body: { message, content: base64, branch: BACKUP_BRANCH },
    });
  } catch (ex) {
    // A retried write can land after the first attempt actually committed.
    if (ex instanceof GitHubError && ex.status === 422) {
      const existing = await githubRequest(
        `/repos/${REPO}/contents/${encodedPath(path)}?ref=${encodeURIComponent(BACKUP_BRANCH)}`,
        { token }
      ).catch(() => null);
      if (existing?.content) return path;
    }
    throw ex;
  }
  return path;
}

/**
 * Copies the exact photo bytes to the archive. Call it before the photo is
 * used anywhere, so every photo on the site always has a backup.
 */
export async function backupPhoto(file, { name: fileName, token = getToken() } = {}) {
  if (!file) throw new GitHubError("No photo to back up.");
  const month = new Date().toISOString().slice(0, 7);
  const name = fileName || photoFileName(file);
  const path = `${BACKUP_DIR}/photos/${month}/${name}`;
  await backupFile(path, await blobToBase64(file), `Backup: photo ${name}`, token);
  return path;
}

/** Archives one product as it was, so details survive any later change. */
export async function backupProductSnapshot(product, { reason = "saved", commit = "", token = getToken() } = {}) {
  if (!product?.id) throw new GitHubError("No product to back up.");
  const id = String(product.id).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "product";
  const at = new Date().toISOString();
  const path = `${BACKUP_DIR}/products/${id}/${at.replace(/[:.]/g, "-")}-${reason}.json`;
  const doc = { backedUpAt: at, reason, commit, product };
  await backupFile(
    path,
    encodeBase64Utf8(`${JSON.stringify(doc, null, 2)}\n`),
    `Backup: product “${product.name || product.id}”`,
    token
  );
  return path;
}

/* ── Image uploads ────────────────────────────────────────────────────── */

const slugify = (value) =>
  String(value || "image")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";

const loadBitmap = async (file) => {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
};

async function compressImage(file) {
  if (file.type === "image/gif") return file;
  if (file.size <= 900 * 1024) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }

  const width = bitmap.width || bitmap.naturalWidth || 0;
  const height = bitmap.height || bitmap.naturalHeight || 0;
  if (!width || !height) {
    bitmap.close?.();
    return file;
  }

  // Keep uploads comfortably below GitHub's 1 MB Contents API comfort zone.
  const attempts = [
    { max: 1600, quality: 0.84 },
    { max: 1400, quality: 0.8 },
    { max: 1200, quality: 0.76 },
    { max: 1000, quality: 0.72 },
  ];

  let best = null;
  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.max / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", attempt.quality));
    if (!blob) break;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= 900 * 1024) break;
  }
  bitmap.close?.();

  if (!best) return file;
  const base = slugify(file.name);
  return new File([best], `${base}.webp`, { type: "image/webp" });
}

const blobToBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const extensionFor = (file) => {
  const byType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  if (byType[file.type]) return byType[file.type];
  const match = /\.([a-z0-9]+)$/i.exec(file.name || "");
  return match ? match[1].toLowerCase() : "jpg";
};

export const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
export const IMAGEKIT_FOLDER = "/nilaara/products";

/** Unique name shared by the ImageKit copy and the archived copy. */
export const photoFileName = (file) =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${slugify(file.name)}.${extensionFor(file)}`;

/**
 * Short-lived ImageKit credentials from our own serverless function. Missing
 * keys, an expired GitHub session or a network failure all return null, and
 * the upload then goes to the repo exactly as before.
 */
async function imageKitAuth(token) {
  if (!token) return null;
  try {
    const res = await fetch("/api/imagekit", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.configured && data.signature ? data : null;
  } catch {
    return null;
  }
}

/** Calls on the photo service that are not uploads: listing and deleting. */
async function imageKitRequest(body, token) {
  if (!token) throw new GitHubError("Sign in with GitHub again to manage photos.");
  let res;
  try {
    res = await fetch("/api/imagekit", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GitHubError("Couldn't reach the photo service. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GitHubError(data?.message || `The photo service returned ${res.status}.`, res.status, data);
  }
  return data;
}

/** Photos in the storefront folder, or null when ImageKit is not configured. */
export async function listImageKitPhotos(token = getToken()) {
  const data = await imageKitRequest({ action: "list" }, token);
  if (!data?.configured) return null;
  return Array.isArray(data.files) ? data.files : [];
}

export async function deleteImageKitPhoto(filePath, token = getToken()) {
  const data = await imageKitRequest({ action: "delete", filePath }, token);
  if (!data?.configured) throw new GitHubError("Photo cleanup needs the ImageKit keys in Vercel.");
  return data.deleted;
}

export async function uploadToImageKit(file, auth, name = photoFileName(file)) {
  const fileName = name;
  const body = new FormData();
  body.append("file", file, file.name || `${fileName}.webp`);
  body.append("fileName", fileName);
  body.append("folder", IMAGEKIT_FOLDER);
  body.append("useUniqueFileName", "true");
  body.append("publicKey", auth.publicKey);
  body.append("token", auth.token);
  body.append("expire", String(auth.expire));
  body.append("signature", auth.signature);

  let res;
  try {
    res = await fetch(IMAGEKIT_UPLOAD_URL, { method: "POST", body });
  } catch {
    throw new GitHubError("Couldn't reach ImageKit. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new GitHubError(data?.message || `ImageKit returned ${res.status}.`, res.status, data);
  }
  return { url: data.url, path: data.filePath || "", name: data.name || fileName };
}

export async function uploadImage(file, token = getToken()) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new GitHubError("Please choose an image file (JPG, PNG, WebP or GIF).");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new GitHubError("That image is larger than 12 MB. Please choose a smaller photo.");
  }

  const prepared = await compressImage(file);

  // ImageKit keeps photo bytes out of the storefront's git tree. Anything it
  // cannot do (no keys yet, bad response) falls through to the commit upload
  // below, which is itself a git copy.
  const auth = await imageKitAuth(token);
  if (auth) {
    const name = photoFileName(prepared);
    // Archive first: no photo reaches the storefront without a backup copy.
    try {
      await backupPhoto(prepared, { name, token });
    } catch (ex) {
      throw new GitHubError(
        `The photo was not uploaded because its backup copy could not be saved. ${ex.message}`,
        ex.status || 0
      );
    }
    try {
      return await uploadToImageKit(prepared, auth, name);
    } catch (ex) {
      console.warn("ImageKit upload failed; committing the photo to GitHub instead.", ex);
    }
  }

  if (prepared.size > 900 * 1024) {
    throw new GitHubError("That image is still larger than 900 KB after resizing. Please choose a smaller photo.");
  }

  const ext = extensionFor(prepared);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${slugify(prepared.name)}.${ext}`;
  const path = `${UPLOADS_DIR}/${name}`;
  const content = await blobToBase64(prepared);
  const contentPath = `/repos/${REPO}/contents/${encodedPath(path)}`;

  try {
    await githubRequest(contentPath, {
      method: "PUT",
      token,
      attempts: 3,
      body: {
        message: `Admin: upload ${name}`,
        content,
        branch: BRANCH,
      },
    });
  } catch (ex) {
    // A retried write can arrive after the first attempt actually committed,
    // in which case GitHub answers 422 because the path now exists.
    if (ex instanceof GitHubError && ex.status === 422) {
      const existing = await githubRequest(`${contentPath}?ref=${encodeURIComponent(BRANCH)}`, { token });
      if (!existing?.content) throw ex;
    } else {
      throw ex;
    }
  }

  return { url: `/uploads/${name}`, path, name };
}

/** Preview committed uploads immediately, before the Vercel rebuild finishes. */
export function previewUrl(url) {
  return mediaUrl(url);
}
