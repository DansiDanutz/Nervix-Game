import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeliberateClick, CLICK_MAX_TRAVEL_PX } from "./clickGuard.ts";

test("a press and release in place counts as a click", () => {
  assert.equal(isDeliberateClick(0), true);
  assert.equal(isDeliberateClick(CLICK_MAX_TRAVEL_PX), true);
});

test("a look-drag over a door is not a click", () => {
  assert.equal(isDeliberateClick(CLICK_MAX_TRAVEL_PX + 0.5), false);
  assert.equal(isDeliberateClick(300), false);
});

test("a missing travel distance is not a click", () => {
  assert.equal(isDeliberateClick(Number.NaN), false);
});
