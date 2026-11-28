// Run from app/: node --test src/scene/contactShadowPose.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { CONTACT_SHADOW, contactShadowPose } from "./contactShadowPose.ts";

test("the shadow falls away from the sun", () => {
  // Arrival sun: from -x, high, +z (manifest lighting.sun.position).
  const p = contactShadowPose([-33.08, 39.09, 31.27], 1.8);
  assert.ok(p.offsetX > 0 && p.offsetZ < 0);
  const len = Math.hypot(p.offsetX, p.offsetZ);
  assert.ok(Math.abs(p.offsetX / len - 33.08 / Math.hypot(33.08, 31.27)) < 1e-3);
  assert.ok(Math.abs(Math.atan2(p.offsetX, p.offsetZ) - p.yaw) < 1e-3);
});

test("a lower sun casts a longer shadow", () => {
  const high = contactShadowPose([-1, 2, 0], 1.8);
  const low = contactShadowPose([-1, 0.6, 0], 1.8);
  assert.ok(low.length > high.length);
  assert.ok(Math.abs(high.length - (1.8 / 2 + CONTACT_SHADOW.footPad)) < 1e-3);
});

test("length is clamped at grazing and overhead suns", () => {
  assert.equal(contactShadowPose([-1, 0.01, 0], 1.8).length, CONTACT_SHADOW.maxLength);
  const overhead = contactShadowPose([0, 1, 0], 1.8);
  assert.deepEqual([overhead.length, overhead.offsetX, overhead.offsetZ], [CONTACT_SHADOW.minLength, 0, 0]);
  assert.equal(contactShadowPose([-1, -1, 0], 1.8).length, CONTACT_SHADOW.minLength);
});
