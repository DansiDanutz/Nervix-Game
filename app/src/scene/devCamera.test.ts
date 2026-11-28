// Run from app/: node --test src/scene/devCamera.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { devCameraRequested, parseA01Pose, poseDirection } from "./devCamera.ts";

const VALID = { position: [15.6, 6, 1.2], target: [-14.094, 3.385, 4.583], up: [0, 1, 0], fov: 66, near: 0.1, far: 1200 };

test("parses the A01 pose written by arrival_camera.py", () => {
  const raw = JSON.parse(readFileSync(new URL("../../public/slice/a01-camera.json", import.meta.url), "utf8"));
  const pose = parseA01Pose(raw);
  assert.equal(pose.position.length, 3);
  assert.ok(pose.fov > 0 && pose.fov < 180);
  // Blender -> runtime: runtime (x, y, z) = (bx, bz, -by).
  assert.deepEqual(pose.position, [raw.blender.eye[0], raw.blender.eye[2], -raw.blender.eye[1]]);
  assert.deepEqual(pose.target, [raw.blender.target[0], raw.blender.target[2], -raw.blender.target[1]]);
});

test("direction is a unit vector toward the target", () => {
  const d = poseDirection(parseA01Pose(VALID));
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
  assert.ok(d[0] < 0, "A01 looks toward -x, across the fountain");
});

test("defaults up to +y when omitted", () => {
  const { up: _up, ...rest } = VALID;
  assert.deepEqual(parseA01Pose(rest).up, [0, 1, 0]);
});

test("rejects malformed pose files with a field-level message", () => {
  assert.throws(() => parseA01Pose(null), /not an object/);
  assert.throws(() => parseA01Pose({ ...VALID, position: [1, 2] }), /position/);
  assert.throws(() => parseA01Pose({ ...VALID, target: [0, "1", 2] }), /target/);
  assert.throws(() => parseA01Pose({ ...VALID, fov: 0 }), /fov/);
  assert.throws(() => parseA01Pose({ ...VALID, fov: 200 }), /fov/);
  assert.throws(() => parseA01Pose({ ...VALID, near: 10, far: 5 }), /far/);
  assert.throws(() => parseA01Pose({ ...VALID, target: VALID.position }), /target equals position/);
});

test("only ?cam=a01 activates the override", () => {
  assert.equal(devCameraRequested("?cam=a01"), true);
  assert.equal(devCameraRequested("?debug=1&cam=a01"), true);
  assert.equal(devCameraRequested(""), false);
  assert.equal(devCameraRequested("?cam=A01x"), false);
});
