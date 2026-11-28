// Run: node --test app/src/player/cameraRig.test.ts (Node type stripping, no deps)
import test from "node:test";
import assert from "node:assert/strict";
import { cameraOffset, moveVector, applyLook, resolveMove, thirdPersonFrame, PITCH_LIMITS, VIEW, type Vec3 } from "./cameraRig.ts";
import { AVATAR_HEIGHT, AVATAR_RADIUS } from "./avatarShape.ts";

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

/* Arrival composition (contract: spawn (19, 0.6) yaw π/2, vertical FOV 55°, 16:9). */
const SPAWN = { x: 19, z: 0.6 };
const SPAWN_LOOK = { yaw: Math.PI / 2, pitch: VIEW.exterior.pitch };
const FOV_Y = (55 * Math.PI) / 180;
const ASPECT = 16 / 9;
const AVATAR = { radius: AVATAR_RADIUS, height: AVATAR_HEIGHT };
/** The avatar fills at most this share of the frame height (A01 review: compass star and cafe stay clear). */
const AVATAR_MAX_FRAME_HEIGHT = 0.31;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Pinhole projection to NDC, the same convention as three.js Vector3.project. */
function project(p: Vec3, camera: Vec3, target: Vec3) {
  const f = unit(sub(target, camera));
  const r = unit(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  const v = sub(p, camera);
  const depth = dot(v, f);
  const t = Math.tan(FOV_Y / 2);
  return { x: dot(v, r) / (depth * t * ASPECT), y: dot(v, u) / (depth * t), depth };
}

test("arrival camera is pedestrian eye level, level gaze, behind the player", () => {
  const { camera, target } = thirdPersonFrame(SPAWN, SPAWN_LOOK, VIEW.exterior);
  assert.ok(camera.y > 1.4 && camera.y < 2.1, `camera y ${camera.y}`);
  const gaze = unit(sub(target, camera));
  assert.ok(gaze.y < 0.05 && gaze.y > -0.25, `gaze y ${gaze.y}`);
  assert.ok(camera.x > SPAWN.x, "camera behind the player (facing -x)");
  assert.ok(Math.abs(gaze.z) < 1e-9, "gaze parallel to the player's facing");
});

test("arrival frame: fountain in the horizontal centre, avatar in the left third clear of it", () => {
  const { camera, target } = thirdPersonFrame(SPAWN, SPAWN_LOOK, VIEW.exterior);
  const fountain = project({ x: 0, y: 1.2, z: 0 }, camera, target);
  assert.ok(Math.abs(fountain.x) < 0.1, `fountain x ${fountain.x}`);
  assert.ok(fountain.y > -0.6 && fountain.y < 0.5, `fountain y ${fountain.y}`);

  const corners: Vec3[] = [];
  for (const dx of [-AVATAR.radius, AVATAR.radius]) for (const dz of [-AVATAR.radius, AVATAR.radius]) for (const y of [0, AVATAR.height]) {
    corners.push({ x: SPAWN.x + dx, y, z: SPAWN.z + dz });
  }
  const pts = corners.map((c) => project(c, camera, target));
  const maxX = Math.max(...pts.map((p) => p.x));
  const maxY = Math.max(...pts.map((p) => p.y));
  assert.ok(pts.every((p) => p.depth > 0), "avatar in front of the camera");
  assert.ok(maxX < -1 / 3 + 0.05, `avatar right edge ${maxX} must stay in the left third`);
  assert.ok(maxX < fountain.x - 0.05, "avatar does not cover the fountain");
  assert.ok(maxY < 0.15, `avatar top ${maxY} stays in the lower half`);
  const minY = Math.max(-1, Math.min(...pts.map((p) => p.y)));
  const share = (maxY - minY) / 2;
  assert.ok(share <= AVATAR_MAX_FRAME_HEIGHT, `avatar fills ${share.toFixed(3)} of the frame height`);
});
