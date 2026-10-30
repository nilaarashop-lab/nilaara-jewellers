/**
 * Public repository coordinates for live content.
 *
 * The storefront reads the JSON files the admin writes. Vercel serves a
 * build-time snapshot for normal page loads, while an exact commit URL is used
 * for instant updates after an admin save (GitHub's branch URL can be cached
 * for a few minutes). The bundled copies remain the offline fallback.
 */
export const REPO = "nilaarashop-lab/nilaara-jewellers";
export const BRANCH = "main";
export const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

export const commitRawRoot = (commit) =>
  `https://raw.githubusercontent.com/${REPO}/${commit}`;

/**
 * Same-browser tabs use this localStorage key as a tiny "content changed"
 * signal. Admin saves store the new commit SHA; open storefront tabs refresh
 * from that exact commit immediately.
 */
export const CONTENT_EVENT = "nilaara-content-updated";

export function notifyContentUpdated(commit = "") {
  if (typeof window === "undefined") return;
  const detail = { commit: String(commit || ""), at: Date.now() };
  try {
    window.localStorage.setItem(CONTENT_EVENT, JSON.stringify(detail));
  } catch {
    /* storage can be unavailable in private mode */
  }
  try {
    // storage events only fire in other tabs; this covers the tab that saved.
    window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail }));
  } catch {
    /* CustomEvent is unavailable in some test environments */
  }
}

export function readContentUpdate() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONTENT_EVENT);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an admin-uploaded `/uploads/...` path to the committed file.
 * Existing ImageKit and other absolute URLs pass through unchanged.
 */
export function mediaUrl(url, commit = "") {
  const value = String(url || "");
  if (value.startsWith("/uploads/")) {
    const root = commit ? commitRawRoot(commit) : RAW_ROOT;
    return `${root}/frontend/public${value}`;
  }
  return value;
}

const IMAGEKIT_HOST = "https://ik.imagekit.io/";

/**
 * Ask ImageKit for a downsized copy instead of the full-size original.
 * Anything that is not an ImageKit file (repo uploads, pasted links) and any
 * URL without a width are returned untouched.
 */
export function imageKitUrl(url, width, quality = 80) {
  const value = String(url || "");
  if (!width || !value.startsWith(IMAGEKIT_HOST) || /[?&]tr=/.test(value)) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}tr=w-${Math.round(width)},q-${quality}`;
}
