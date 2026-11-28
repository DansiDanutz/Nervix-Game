// CT5 on the plaza: only boxes that really stand between the eye and the camera pull the boom in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAMERA_BLOCKERS, plazaCameraBlockers } from "./cameraBlockers.ts";
import { pulledInCamera, VIEW, type Box } from "./cameraRig.ts";

const manifest = JSON.parse(readFileSync(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
const plaza = manifest.runtime_layout.plaza as { obstacles: Box[]; fountain: { x: number; z: number } };
const blockers = plazaCameraBlockers(plaza.obstacles, plaza.fountain);
const longest = (b: Box) => Math.max(b.maxX - b.minX, b.maxZ - b.minZ);

function step(x: number, z: number, yaw: number, boxes: readonly Box[]) {
  const look = { yaw, pitch: VIEW.exterior.pitch };
  return pulledInCamera({ at: { x, z }, look, view: VIEW.exterior, blockers: boxes, boom: Number.NaN, delta: 1 / 60, reducedMotion: false });
}

test("with the player's back to the fountain the boom stays out (the camera rides over the basin)", () => {
  // Camera on -z of a player at (0, 4.6) (yaw pi) and on -x of a player at (4.6, 0) (yaw -pi/2).
  for (const [x, z, yaw] of [[0, 4.6, Math.PI], [4.6, 0, -Math.PI / 2], [0, -4.6, 0], [-4.6, 0, Math.PI / 2]]) {
    assert.equal(step(x, z, yaw, plaza.obstacles).pulledIn, true, "the raw collision boxes do pull in (the bug)");
    assert.equal(step(x, z, yaw, blockers).pulledIn, false, `pulled in at ${x},${z}`);
  }
});

test("street posts, bollards and benches never pull the camera into the avatar's head", () => {
  assert.equal(step(-1.5, 8.2, Math.PI, blockers).pulledIn, false);
  assert.ok(blockers.every((b) => longest(b) >= CAMERA_BLOCKERS.minWallSide));
});

test("facade walls still stop the camera: back to the OpenPoker front wall", () => {
  const s = step(0, -7.5, Math.PI, blockers);
  assert.equal(s.pulledIn, true);
  assert.equal(s.alpha, 1);
});

test("the fountain basin box is not a blocker and the blocker list is frozen", () => {
  const holdsFountain = (b: Box) => b.minX < plaza.fountain.x && b.maxX > plaza.fountain.x && b.minZ < plaza.fountain.z && b.maxZ > plaza.fountain.z;
  assert.ok(plaza.obstacles.some(holdsFountain));
  assert.ok(!blockers.some(holdsFountain));
  assert.ok(Object.isFrozen(blockers));
  assert.ok(blockers.length > 0 && blockers.length < plaza.obstacles.length);
});
