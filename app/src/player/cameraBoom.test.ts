// CT5 hookup glue: the controller's camera step with pull-in, against collision boxes and room walls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAMERA_COLLISION, cameraFollowAlpha, pulledInCamera, roomWalls, thirdPersonFrame, VIEW, type Box } from "./cameraRig.ts";

const manifest = JSON.parse(readFileSync(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
const plaza = manifest.runtime_layout.plaza as { spawn: { x: number; z: number; yaw: number }; obstacles: Box[] };
/** SceneView's house room bounds. */
const ROOM_BOUNDS: Box = { minX: -5.6, maxX: 5.6, minZ: -4.2, maxZ: 4.2 };
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("room walls enclose the bounds from outside and never contain a point inside them", () => {
  const walls = roomWalls(ROOM_BOUNDS);
  assert.equal(walls.length, 4);
  const inside = (b: Box, x: number, z: number) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  for (const [x, z] of [[0, 0], [5.5, 4.1], [-5.5, -4.1]]) assert.ok(walls.every((w) => !inside(w, x, z)));
  for (const [x, z] of [[6, 0], [-6, 0], [0, 4.5], [0, -4.5]]) assert.ok(walls.some((w) => inside(w, x, z)), `${x},${z}`);
  assert.ok(Object.isFrozen(walls));
});

test("the arrival frame is unchanged: nothing in the plaza collision pulls the camera in at the spawn", () => {
  const look = { yaw: plaza.spawn.yaw, pitch: VIEW.exterior.pitch };
  const at = { x: plaza.spawn.x, z: plaza.spawn.z };
  const step = pulledInCamera({ at, look, view: VIEW.exterior, blockers: plaza.obstacles, boom: Number.NaN, delta: 1 / 60, reducedMotion: false });
  const full = thirdPersonFrame(at, look, VIEW.exterior);
  close(step.camera.x, full.camera.x);
  close(step.camera.y, full.camera.y);
  close(step.camera.z, full.camera.z);
  assert.deepEqual(step.target, full.target);
  assert.equal(step.pulledIn, false);
});

test("inside a house the camera stops in front of the wall behind the player", () => {
  const at = { x: 0, z: 3.2 };
  const look = { yaw: 0, pitch: VIEW.interior.pitch };
  const step = pulledInCamera({ at, look, view: VIEW.interior, blockers: roomWalls(ROOM_BOUNDS), boom: Number.NaN, delta: 1 / 60, reducedMotion: false });
  assert.equal(step.pulledIn, true);
  // The margin is measured along the (slanted) boom, so the gap to the wall face is a little under it.
  assert.ok(step.camera.z < ROOM_BOUNDS.maxZ - CAMERA_COLLISION.margin / 2, `camera z ${step.camera.z}`);
  assert.equal(step.alpha, 1, "a pulled-in camera snaps, never lags behind the wall");
});

test("an unobstructed camera follows with the normal lerp, and reduced motion snaps", () => {
  const args = { at: { x: 0, z: 0 }, look: { yaw: 0, pitch: 0.1 }, view: VIEW.exterior, blockers: [], boom: Number.NaN, delta: 0.016 };
  close(pulledInCamera({ ...args, reducedMotion: false }).alpha, cameraFollowAlpha(0.016, false));
  assert.equal(pulledInCamera({ ...args, reducedMotion: true }).alpha, 1);
});

test("after the wall is gone the boom eases back out instead of jumping", () => {
  const args = { at: { x: 0, z: 0 }, look: { yaw: 0, pitch: 0.1 }, view: VIEW.exterior, blockers: [], delta: 0.016, reducedMotion: false };
  const step = pulledInCamera({ ...args, boom: 1 });
  assert.ok(step.boom > 1 && step.boom < 3, `boom ${step.boom}`);
});
