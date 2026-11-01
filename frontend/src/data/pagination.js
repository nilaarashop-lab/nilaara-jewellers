/**
 * Shop listing pages.
 *
 * The catalogue grows past what one screen should hold, so the listing shows a
 * page at a time. The page number travels in the URL, which means a visitor can
 * paste a junk value ("?page=9999", "?page=abc"), hence the clamping here.
 */

export const PAGE_SIZE = 8;

export const pageCount = (total, size = PAGE_SIZE) =>
  Math.max(1, Math.ceil((Number(total) || 0) / size));

/** The page a raw URL value asks for, pulled back inside the real range. */
export const clampPage = (page, total, size = PAGE_SIZE) => {
  const wanted = Math.floor(Number(page));
  if (!Number.isFinite(wanted)) return 1;
  return Math.min(pageCount(total, size), Math.max(1, wanted));
};

/** The pieces on one page. */
export const pageSlice = (list, page, size = PAGE_SIZE) => {
  const start = (clampPage(page, list.length, size) - 1) * size;
  return list.slice(start, start + size);
};

/**
 * Which page buttons to draw: first, last, the current page and its
 * neighbours, with null for a jump. A short listing shows them all, and a
 * single hidden page is shown instead of an ellipsis, so "1 … 2 3" never happens.
 */
export function pageWindow(pages, current, radius = 1) {
  if (pages <= 1) return [1];
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const wanted = new Set([1, pages]);
  for (let p = current - radius; p <= current + radius; p += 1) {
    if (p >= 1 && p <= pages) wanted.add(p);
  }
  const out = [];
  let last = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (p - last === 2) out.push(last + 2);
    else if (p - last > 1) out.push(null);
    out.push(p);
    last = p;
  }
  return out;
}
