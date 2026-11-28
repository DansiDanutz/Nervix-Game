import { test } from "node:test";
import assert from "node:assert/strict";
import { BLENDER_WORLD, SKY_STOP_COUNT, cloudMask, rampSegment } from "./skyRamp.ts";

const positions = BLENDER_WORLD.stops.map((s) => s.position);

test("the ramp mirrors build_world: six ascending stops from peach horizon to blue zenith", () => {
  assert.equal(SKY_STOP_COUNT, 6);
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i] > positions[i - 1]);
  assert.equal(BLENDER_WORLD.stops[0].color, "#ffd9a0");
  assert.equal(BLENDER_WORLD.stops[SKY_STOP_COUNT - 1].color, "#8db7e8");
  assert.equal(BLENDER_WORLD.strength, 1.1);
});

test("rampSegment clamps below and above and interpolates inside", () => {
  assert.deepEqual(rampSegment(positions, -0.4), { index: 0, t: 0 });
  assert.deepEqual(rampSegment(positions, 0.95), { index: 5, t: 0 });
  const mid = rampSegment(positions, 0.375);
  assert.equal(mid.index, 3);
  assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
  assert.deepEqual(rampSegment([0.2], 0.5), { index: 0, t: 0 });
  assert.throws(() => rampSegment([], 0.5), /no stops/);
});

test("cloudMask is Blender's linear 0.55 -> 0.75 ramp", () => {
  assert.equal(cloudMask(0.5), 0);
  assert.equal(cloudMask(0.8), 1);
  assert.ok(Math.abs(cloudMask(0.65) - 0.5) < 1e-9);
});
