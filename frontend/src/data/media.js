/**
 * Which ImageKit photos may be deleted.
 *
 * A photo is unused when no catalogue or homepage JSON mentions it. The scan is
 * deliberately blunt — every string in both documents counts, including hidden
 * slides and inactive blocks — so a piece the owner has parked is never thrown
 * away. Photos younger than the grace period are also left alone, because an
 * upload in a form that has not been saved yet looks unused.
 */

const IMAGEKIT_HOST = "https://ik.imagekit.io/";

export const UNUSED_PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** "/nilaara/products/x.png" for an ImageKit URL, "" for anything else. */
export function imageKitPath(url) {
  const value = String(url || "");
  if (!value.startsWith(IMAGEKIT_HOST)) return "";
  const rest = value.slice(IMAGEKIT_HOST.length).split(/[?#]/)[0];
  const slash = rest.indexOf("/");
  return slash < 0 ? "" : decode(rest.slice(slash));
}

const collectStrings = (value, out) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
};

/** ImageKit paths mentioned anywhere in the given documents. */
export function referencedImageKitPaths(docs) {
  const strings = [];
  (Array.isArray(docs) ? docs : [docs]).forEach((doc) => collectStrings(doc, strings));
  const paths = new Set();
  strings.forEach((value) => {
    const path = imageKitPath(value);
    if (path) paths.add(path);
  });
  return paths;
}

const pathOf = (file) => imageKitPath(file?.url) || decode(String(file?.path || ""));

export function unusedPhotos(files, referenced, { now = Date.now(), graceMs = UNUSED_PHOTO_GRACE_MS } = {}) {
  const used = referenced instanceof Set ? referenced : new Set(referenced || []);
  return (Array.isArray(files) ? files : []).filter((file) => {
    const path = pathOf(file);
    if (!path || used.has(path)) return false;
    const created = Date.parse(file?.createdAt || "");
    if (!Number.isFinite(created)) return false;
    return now - created >= graceMs;
  });
}
