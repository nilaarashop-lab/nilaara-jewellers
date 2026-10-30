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

/**
 * A quarter-turn swaps width and height. Turns are counted clockwise and kept
 * at 0–3, so the caller only ever rotates by 90° steps.
 */
export const rotatedDims = (imgW, imgH, turns = 0) =>
  turns % 2 === 0 ? { w: imgW, h: imgH } : { w: imgH, h: imgW };

/**
 * The offscreen canvas a rotated photo is drawn into: swapped dimensions, and
 * scaled down only when the photo is larger than `maxEdge`. `scale` is 1 for
 * everything a phone or camera usually produces.
 */
export const rotationPlan = (imgW, imgH, turns = 0, maxEdge = 2400) => {
  const { w, h } = rotatedDims(imgW, imgH, turns);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
    scale,
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
