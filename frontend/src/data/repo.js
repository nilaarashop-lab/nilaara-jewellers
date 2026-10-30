/**
 * Public repository coordinates for live content.
 *
 * The storefront reads the same JSON files the admin writes. Fetching them from
 * GitHub's raw host means a save is visible on the next fetch, without waiting
 * for a Vercel rebuild. The bundled copies remain the offline fallback.
 */
export const REPO = "nilaarashop-lab/nilaara-jewellers";
export const BRANCH = "main";
export const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

/**
 * Same-browser tabs use this localStorage key as a tiny "content changed"
 * signal. Admin saves bump it; open storefront tabs refresh immediately.
 */
export const CONTENT_EVENT = "nilaara-content-updated";

export function notifyContentUpdated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTENT_EVENT, String(Date.now()));
  } catch {
    /* storage can be unavailable in private mode */
  }
}

/**
 * Resolve an admin-uploaded `/uploads/...` path to the committed file.
 * Existing ImageKit and other absolute URLs pass through unchanged.
 */
export function mediaUrl(url) {
  const value = String(url || "");
  if (value.startsWith("/uploads/")) {
    return `${RAW_ROOT}/frontend/public${value}`;
  }
  return value;
}
