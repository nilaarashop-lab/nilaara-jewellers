import assert from "node:assert/strict";
import { test } from "node:test";
import { clampPan, coverScale, fitFrame, outputSize, panLimits, sourceRect } from "../src/data/crop.js";

test("the frame is the biggest box of its shape that fits the stage", () => {
  assert.deepEqual(fitFrame(400, 400, 1), { w: 400, h: 400 });
  assert.deepEqual(fitFrame(400, 400, 10 / 11), { w: 364, h: 400 });
  assert.deepEqual(fitFrame(300, 600, 1), { w: 300, h: 300 });
});

test("cover scale always fills the frame", () => {
  assert.equal(coverScale(1000, 500, 100, 100), 0.2);
  assert.equal(coverScale(500, 1000, 100, 100), 0.2);
  assert.equal(coverScale(2000, 1000, 100, 200), 0.2);
});

test("a photo that only just covers the frame cannot be dragged", () => {
  assert.deepEqual(panLimits(1000, 1000, 100, 100, 1), { x: 0, y: 0 });
  assert.deepEqual(panLimits(1000, 1000, 100, 100, 2), { x: 50, y: 50 });
  assert.deepEqual(clampPan(1000, 1000, 100, 100, 2, 500, -500), { tx: 50, ty: -50 });
});

test("the frame looks at the middle of an unzoomed photo", () => {
  assert.deepEqual(
    sourceRect({ imgW: 2000, imgH: 1000, frameW: 100, frameH: 100 }),
    { x: 500, y: 0, w: 1000, h: 1000 }
  );
});

test("dragging the photo right moves the crop window left", () => {
  const dragged = sourceRect({ imgW: 2000, imgH: 1000, frameW: 100, frameH: 100, tx: 10 });
  assert.equal(dragged.x, 400);
});

test("zooming shrinks the source window around the same centre", () => {
  const zoomed = sourceRect({ imgW: 2000, imgH: 1000, frameW: 100, frameH: 100, zoom: 2 });
  assert.deepEqual(zoomed, { x: 750, y: 250, w: 500, h: 500 });
});

test("a clamped crop never reaches outside the photo", () => {
  for (const zoom of [1, 1.5, 3]) {
    for (const wanted of [[-9999, 0], [9999, 9999], [0, -500]]) {
      const { tx, ty } = clampPan(3000, 2000, 320, 352, zoom, ...wanted);
      const rect = sourceRect({ imgW: 3000, imgH: 2000, frameW: 320, frameH: 352, zoom, tx, ty });
      assert.ok(rect.x >= -0.5, `x start ${rect.x}`);
      assert.ok(rect.y >= -0.5, `y start ${rect.y}`);
      assert.ok(rect.x + rect.w <= 3000.5, `right ${rect.x + rect.w}`);
      assert.ok(rect.y + rect.h <= 2000.5, `bottom ${rect.y + rect.h}`);
    }
  }
});

test("output stays capped on its long edge", () => {
  assert.deepEqual(outputSize({ w: 1000, h: 800 }), { w: 1000, h: 800 });
  assert.deepEqual(outputSize({ w: 3000, h: 1500 }), { w: 1600, h: 800 });
});
