// Run from app/: node --test src/scene/nearFade.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { LABEL_FADE, nearFadeOpacity } from "./nearFade.ts";

test("labels are fully shown near the door and hidden from the arrival camera", () => {
  assert.equal(nearFadeOpacity(0), 1);
  assert.equal(nearFadeOpacity(LABEL_FADE.near), 1);
  assert.equal(nearFadeOpacity(LABEL_FADE.far), 0);
  // Spawn camera (21.98, -0.70) to the OpenPoker door (0, -9.7): about 23.8 m.
  assert.equal(nearFadeOpacity(Math.hypot(21.98, 9.0)), 0);
  // Spawn camera to the Test Builder door threshold (15, 3.7): about 8.3 m.
  assert.equal(nearFadeOpacity(Math.hypot(21.98 - 15, -0.7 - 3.7)), 0);
});

test("opacity falls linearly between near and far", () => {
  const mid = (LABEL_FADE.near + LABEL_FADE.far) / 2;
  assert.ok(Math.abs(nearFadeOpacity(mid) - 0.5) < 1e-9);
  assert.ok(Math.abs(nearFadeOpacity(15, { near: 10, far: 20 }) - 0.5) < 1e-9);
});
