// Run: node --test app/src/player/cameraRig.test.ts (Node type stripping, no deps)
import test from "node:test";
import assert from "node:assert/strict";
import { cameraOffset, moveVector, applyLook, resolveMove, PITCH_LIMITS } from "./cameraRig.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("yaw 0 puts the camera behind the player on +z", () => {
  const o = cameraOffset(0, 0, 8);
  close(o.x, 0);
  close(o.z, 8);
});

test("W walks away from the camera, D to screen-right, at any yaw", () => {
  for (const yaw of [0, Math.PI / 2, -2.1]) {
    const cam = cameraOffset(yaw, 0, 1);
    const fwd = moveVector(1, 0, yaw);
    close(fwd.x, -cam.x);
    close(fwd.z, -cam.z);
    const right = moveVector(0, 1, yaw);
    // right is forward rotated -90 degrees about +y
    close(right.x, -fwd.z);
    close(right.z, fwd.x);
  }
});

test("diagonal movement is normalised", () => {
  const v = moveVector(1, 1, 0.3);
  close(Math.hypot(v.x, v.z), 1);
  assert.deepEqual(moveVector(0, 0, 1), { x: 0, z: 0 });
});

test("mouse look turns yaw and clamps pitch", () => {
  const a = applyLook({ yaw: 0, pitch: 0.3 }, 100, 0, 0.005);
  close(a.yaw, -0.5);
  const b = applyLook({ yaw: 0, pitch: 0.3 }, 0, 10_000, 0.005);
  close(b.pitch, PITCH_LIMITS.max);
  const c = applyLook({ yaw: 0, pitch: 0.3 }, 0, -10_000, 0.005);
  close(c.pitch, PITCH_LIMITS.min);
});

test("moves are blocked by obstacles but slide along them", () => {
  const box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  const blocked = resolveMove({ x: 0, z: 2 }, { x: 0, z: 0.5 }, [box], 0.3, 50);
  assert.deepEqual(blocked, { x: 0, z: 2 });
  const slide = resolveMove({ x: 2, z: 2 }, { x: 1.2, z: 1.2 }, [box], 0.3, 50);
  assert.deepEqual(slide, { x: 1.2, z: 2 });
  const free = resolveMove({ x: 3, z: 3 }, { x: 3.2, z: 3.1 }, [box], 0.3, 50);
  assert.deepEqual(free, { x: 3.2, z: 3.1 });
});

test("moves are clamped to the walkable bounds", () => {
  const bounds = { minX: -5, maxX: 5, minZ: -6, maxZ: 7 };
  assert.deepEqual(resolveMove({ x: 4.9, z: 0 }, { x: 6, z: 0 }, [], 0.3, bounds), { x: 4.7, z: 0 });
});
