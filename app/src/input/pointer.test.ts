import test from "node:test";
import assert from "node:assert/strict";
import { isLookDrag, LOOK_DRAG_THRESHOLD_PX } from "./pointer.ts";
import { CLICK_MAX_TRAVEL_PX, isDeliberateClick } from "../scene/clickGuard.ts";

test("the look-drag threshold matches the door click guard, so a press is either a click or a drag", () => {
  assert.equal(LOOK_DRAG_THRESHOLD_PX, CLICK_MAX_TRAVEL_PX);
  for (const travel of [0, 3, 6, 6.01, 7, 40]) {
    const start = { x: 100, y: 100 };
    const now = { x: 100 + travel, y: 100 };
    assert.notEqual(isLookDrag(start, now), isDeliberateClick(travel), `travel ${travel}`);
  }
});

test("travel is measured in both axes", () => {
  assert.equal(isLookDrag({ x: 0, y: 0 }, { x: 4, y: 4 }), false);
  assert.equal(isLookDrag({ x: 0, y: 0 }, { x: 5, y: 5 }), true);
});
