import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_SIZE, clampPage, pageCount, pageSlice, pageWindow } from "../src/data/pagination.js";

const list = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test("the listing shows eight pieces per page", () => {
  assert.equal(PAGE_SIZE, 8);
  assert.equal(pageCount(143), 18);
  assert.equal(pageSlice(list(143), 1).length, 8);
  assert.deepEqual(pageSlice(list(143), 2).slice(0, 2), ["p9", "p10"]);
  assert.deepEqual(pageSlice(list(143), 18), list(143).slice(136));
});

test("a page size that divides the catalogue leaves no empty page", () => {
  assert.equal(pageCount(16), 2);
  assert.equal(pageSlice(list(16), 2).length, 8);
  assert.equal(pageSlice(list(0), 1).length, 0);
});

test("a junk page number in a shared link lands on a real page", () => {
  for (const junk of ["", "abc", "0", "-3", null, undefined]) {
    assert.equal(clampPage(junk, 143), 1, String(junk));
  }
  assert.equal(clampPage(9999, 143), 18);
  assert.equal(clampPage(2.7, 143), 2);
  assert.deepEqual(pageSlice(list(143), "abc")[0], "p1");
});

test("page buttons keep the ends and jump over the middle", () => {
  assert.deepEqual(pageWindow(18, 1), [1, 2, null, 18]);
  assert.deepEqual(pageWindow(18, 9), [1, null, 8, 9, 10, null, 18]);
  assert.deepEqual(pageWindow(18, 18), [1, null, 17, 18]);
  assert.deepEqual(pageWindow(1, 1), [1]);
});

test("a single skipped page is shown instead of an ellipsis", () => {
  // 1 … 2 3 would be silly, so page 2 fills the gap.
  assert.deepEqual(pageWindow(5, 2), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(4, 1), [1, 2, 3, 4]);
  assert.deepEqual(pageWindow(6, 2), [1, 2, 3, 4, 5, 6]);
});
