/**
 * Crop maths.
 *
 * The dialog keeps the frame still and moves the photo underneath it, so the
 * only state is a zoom factor and a pan offset in on-screen pixels. Everything
 * that converts that state back into source pixels lives here, where it can be
 * tested without a browser.
 */

/** Frames worth offering: what the shop actually displays, plus two classics. */
export const RATIOS = [
  { key: "card", label: "Shop card", ratio: 10 / 11 },
  { key: "square", label: "Square", ratio: 1 },
  { key: "portrait", label: "Portrait", ratio: 4 / 5 },
];

/** Largest frame of `ratio` that fits the stage. */
export const fitFrame = (stageW, stageH, ratio) => {
  const w = Math.min(stageW, stageH * ratio);
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(w / ratio)) };
};

/** Scale that just covers the frame, so no background ever shows through. */
export const coverScale = (imgW, imgH, frameW, frameH) =>
  Math.max(frameW / imgW, frameH / imgH);

/** How far the photo may slide before the frame reaches an edge. */
export const panLimits = (imgW, imgH, frameW, frameH, zoom = 1) => {
  const scale = coverScale(imgW, imgH, frameW, frameH) * zoom;
  return {
    x: Math.max(0, (imgW * scale - frameW) / 2),
    y: Math.max(0, (imgH * scale - frameH) / 2),
  };
};

export const clampPan = (imgW, imgH, frameW, frameH, zoom, tx, ty) => {
  const { x, y } = panLimits(imgW, imgH, frameW, frameH, zoom);
  return {
    tx: Math.min(x, Math.max(-x, tx)),
    ty: Math.min(y, Math.max(-y, ty)),
  };
};

/** The rectangle inside the original photo that the frame is looking at. */
export const sourceRect = ({ imgW, imgH, frameW, frameH, zoom = 1, tx = 0, ty = 0 }) => {
  const scale = coverScale(imgW, imgH, frameW, frameH) * zoom;
  return {
    x: (imgW - frameW / scale) / 2 - tx / scale,
    y: (imgH - frameH / scale) / 2 - ty / scale,
    w: frameW / scale,
    h: frameH / scale,
  };
};

/** Output pixels for that rectangle, capped so the upload stays small. */
export const outputSize = (rect, maxEdge = 1600) => {
  const scale = Math.min(1, maxEdge / Math.max(rect.w, rect.h));
  return {
    w: Math.max(1, Math.round(rect.w * scale)),
    h: Math.max(1, Math.round(rect.h * scale)),
  };
};
