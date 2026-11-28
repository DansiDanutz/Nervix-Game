// CT5 + B2: an obstacle with a manifest top_y stops the boom only where the ray is below that top.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pulledInCamera, rayBoxDistance, VIEW, type Box, type Vec3 } from "./cameraRig.ts";
import { plazaCameraBlockers } from "./cameraBlockers.ts";
import { parseSliceManifest } from "../scene/slice.ts";

const FLAT: Vec3 = Object.freeze({ x: 1, y: 0, z: 0 });
const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 1.62, z: 0 });
const wall = (topY?: number): Box => ({ minX: 2, maxX: 3, minZ: -1, maxZ: 1, ...(topY === undefined ? {} : { topY }) });
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("a box without top_y is a full-height wall (legacy behaviour)", () => {
  close(rayBoxDistance(ORIGIN, FLAT, 5, [wall()]), 2);
});

test("a box whose top is below the boom ray height is ignored", () => {
  assert.equal(rayBoxDistance(ORIGIN, FLAT, 5, [wall(0.6)]), null);
  assert.equal(rayBoxDistance(ORIGIN, FLAT, 5, [wall(1.62)]), null, "a ray exactly at the top passes over it");
});

test("a box taller than the ray blocks at the footprint face", () => {
  close(rayBoxDistance(ORIGIN, FLAT, 5, [wall(1.7)]), 2);
});

test("a rising ray clears a box whose top it has climbed over before the face, and hits one it has not", () => {
  // y = 1.62 + 0.5 t (unnormalised direction is fine for the slab maths): at the face t=2, y=2.62.
  const rising: Vec3 = { x: 1, y: 0.5, z: 0 };
  assert.equal(rayBoxDistance(ORIGIN, rising, 5, [wall(2.5)]), null);
  close(rayBoxDistance(ORIGIN, rising, 5, [wall(2.8)]), 2);
});

test("a falling ray enters a low box through its top, not its face", () => {
  // y = 1.62 - 0.5 t: crosses top 0.62 at t = 2 (the face), top 0.12 at t = 3 (the far side): misses.
  const falling: Vec3 = { x: 1, y: -0.5, z: 0 };
  close(rayBoxDistance(ORIGIN, falling, 5, [wall(1.12)]), 2);
  close(rayBoxDistance(ORIGIN, falling, 5, [wall(0.37)]), 2.5);
  assert.equal(rayBoxDistance(ORIGIN, falling, 5, [wall(0.1)]), null);
});

test("the nearest blocking box wins; low boxes in front never shadow a tall one behind", () => {
  const low = { minX: 1, maxX: 1.5, minZ: -1, maxZ: 1, topY: 0.6 };
  close(rayBoxDistance(ORIGIN, FLAT, 5, [low, wall(4)]), 2);
});

test("the inputs are never mutated", () => {
  const boxes = Object.freeze([Object.freeze(wall(0.6)), Object.freeze(wall())]);
  assert.doesNotThrow(() => rayBoxDistance(ORIGIN, FLAT, 5, boxes));
});

test("shipped manifest: the low west perron (top 0.6 m) no longer pulls the boom in, the facades still do", () => {
  const raw = JSON.parse(readFileSync(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
  const plaza = parseSliceManifest(raw, "manifest.json").plaza!;
  assert.ok(plaza.obstacles.every((b) => typeof b.topY === "number" && b.topY > 0), "every plaza obstacle carries top_y");
  const blockers = plazaCameraBlockers(plaza.obstacles, plaza.fountain);
  const low = blockers.filter((b) => b.topY! < VIEW.exterior.eye);
  assert.ok(low.length > 0, "the wall-scale perrons are below eye height");
  for (const b of low) {
    // Stand just outside the box and look away from it, so the boom runs straight across it.
    const at = { x: (b.minX + b.maxX) / 2, z: b.maxZ + 0.4 };
    const step = pulledInCamera({ at, look: { yaw: Math.PI, pitch: VIEW.exterior.pitch }, view: VIEW.exterior, blockers: [b], boom: Number.NaN, delta: 1 / 60, reducedMotion: false });
    assert.equal(step.pulledIn, false, `low box ${JSON.stringify(b)} pulled the camera in`);
  }
  const s = pulledInCamera({ at: { x: 0, z: -7.5 }, look: { yaw: Math.PI, pitch: VIEW.exterior.pitch }, view: VIEW.exterior, blockers, boom: Number.NaN, delta: 1 / 60, reducedMotion: false });
  assert.equal(s.pulledIn, true, "back to the OpenPoker front wall");
});
