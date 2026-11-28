import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAZA_WALKERS, arcPoints, clearWalkers, parseK1, pathClear, pathLength, samplePath, visibleNodes, type Point } from "./plazaWalkers.ts";

const BOUNDS = { minX: -42, maxX: 34, minZ: -13, maxZ: 13 };
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test("samplePath walks out and back along the polyline, facing the way it moves", () => {
  const path: Point[] = [[0, 0], [0, 4]];
  const out = samplePath(path, 1);
  assert.ok(close(out.x, 0) && close(out.z, 1));
  assert.ok(close(out.heading, 0), "walking +z faces +z");
  const back = samplePath(path, 5);
  assert.ok(close(back.z, 3));
  assert.ok(close(Math.abs(back.heading), Math.PI), "walking back faces -z");
  assert.ok(close(samplePath(path, 8).z, 0), "a full cycle returns to the start");
  assert.ok(close(samplePath(path, -1).z, 1), "negative offsets wrap");
});

test("samplePath handles multi-segment paths and standing walkers", () => {
  const path: Point[] = [[0, 0], [2, 0], [2, 2]];
  assert.equal(pathLength(path), 4);
  const p = samplePath(path, 3);
  assert.ok(close(p.x, 2) && close(p.z, 1));
  assert.deepEqual(samplePath([[5, 6]], 10), { x: 5, z: 6, heading: 0 });
  assert.throws(() => samplePath([], 0), /no points/);
});

test("arcPoints spans the requested angles at the radius", () => {
  const arc = arcPoints(0, 0, 5, -90, 90, 4);
  assert.equal(arc.length, 5);
  assert.ok(close(arc[0][1], -5) && close(arc[4][1], 5) && close(arc[2][0], 5));
});

test("pathClear rejects paths through obstacles or outside bounds", () => {
  const box = { minX: 1, maxX: 2, minZ: -1, maxZ: 1 };
  assert.equal(pathClear([[0, -3], [0, 3]], [box], BOUNDS), true);
  assert.equal(pathClear([[1.5, -3], [1.5, 3]], [box], BOUNDS), false);
  assert.equal(pathClear([[0.8, -3], [0.8, 3]], [box], BOUNDS), false, "the margin keeps shoulders off the box");
  assert.equal(pathClear([[0, 12.9], [3, 12.9]], [], BOUNDS), false);
});

test("clearWalkers drops only the blocked walkers", () => {
  const blocked = clearWalkers(PLAZA_WALKERS, [{ minX: 8, maxX: 17, minZ: 1.5, maxZ: 2.1 }], BOUNDS);
  assert.deepEqual(blocked.map((w) => w.id).includes("street_north"), false);
  assert.equal(blocked.length, PLAZA_WALKERS.length - 1);
});

test("the cast is clear of the exported square and never walks behind the street spawn", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
  const plaza = manifest.runtime_layout.plaza;
  const kept = clearWalkers(PLAZA_WALKERS, plaza.obstacles, plaza.bounds);
  assert.equal(kept.length, PLAZA_WALKERS.length, `only ${kept.map((w) => w.id)} clear`);
  for (const w of PLAZA_WALKERS) for (const [x] of w.path) assert.ok(x < plaza.spawn.x - 2, `${w.id} stays ahead of the spawn`);
});

test("the K1 manifest parses and every walker preset exists", () => {
  const kit = parseK1(JSON.parse(readFileSync(new URL("../../public/kits/k1/manifest.json", import.meta.url), "utf8")));
  assert.ok(kit.clips.includes("walk") && kit.clips.includes("idle") && kit.clips.includes("talk"));
  for (const w of PLAZA_WALKERS) assert.ok(kit.presets.some((p) => p.id === w.preset), `preset ${w.preset}`);
  const nodes = visibleNodes(kit, "burgundy");
  assert.ok(nodes.has("k1_body") && nodes.has("k1_robe_long") && !nodes.has("k1_tunic_knee"));
});

test("parseK1 rejects malformed manifests", () => {
  assert.throws(() => parseK1(null), /not an object/);
  assert.throws(() => parseK1({ glb: "a.glb", material_slots: {}, parts: {}, presets: [], clips: [] }), /parts must be an array/);
  assert.throws(() => parseK1({ glb: "", material_slots: {}, parts: [], presets: [], clips: [] }), /glb must be/);
});
