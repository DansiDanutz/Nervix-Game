import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COUNTER_OFFSET,
  interiorTemplate,
  normaliseSizeClass,
  parseK2,
  placeHouse,
  selectVariant,
  variantHash,
} from "./interiorTemplate.ts";

const KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/kits/k2");
const RAW = JSON.parse(readFileSync(join(KIT_DIR, "manifest.json"), "utf8"));
const KIT = parseK2(RAW);
const inside = (p: readonly number[], b: { min: readonly number[]; max: readonly number[] }) =>
  p.every((v, i) => v >= b.min[i] - 1e-6 && v <= b.max[i] + 1e-6);

test("parseK2 reads all nine K2 variants with anchors and slots", () => {
  assert.equal(KIT.houses.length, 9);
  for (const h of KIT.houses) {
    assert.match(h.file, /^house_(small|medium|large)_(shutters|awning|loggia)\.glb$/);
    assert.ok(h.slots.length >= 6);
    assert.equal(h.sign.surfaceNode, "sign_board");
  }
  assert.ok(Object.isFrozen(KIT) && Object.isFrozen(KIT.houses[0]));
});

test("parseK2 rejects a malformed manifest with a clear message", () => {
  assert.throws(() => parseK2(null), /k2 manifest/);
  assert.throws(() => parseK2({ houses: [{ id: "x" }] }), /houses\[0\]/);
  const badFile = structuredClone(RAW);
  badFile.houses[0].file = "../../etc/passwd.glb";
  assert.throws(() => parseK2(badFile), /file/);
});

test("the size class normalises; unknown classes fall back to medium", () => {
  assert.equal(normaliseSizeClass("Large"), "large");
  assert.equal(normaliseSizeClass("small"), "small");
  assert.equal(normaliseSizeClass("huge"), "medium");
  assert.equal(normaliseSizeClass(undefined), "medium");
});

test("variant choice is deterministic per property and stays within the plot size class", () => {
  const a = selectVariant(KIT, "prop_demo_lantern", "large");
  assert.equal(selectVariant(KIT, "prop_demo_lantern", "large").id, a.id);
  assert.equal(a.sizeClass, "large");
  for (const id of ["prop_dangg", "prop_test", "prop_demo_kettle", "prop_demo_atlas"]) {
    assert.equal(selectVariant(KIT, id, "small").sizeClass, "small");
  }
  assert.equal(variantHash("prop_x"), variantHash("prop_x"));
});

test("different properties spread over the facades of one size class", () => {
  const ids = Array.from({ length: 30 }, (_, i) => `prop_${i}`);
  const facades = new Set(ids.map((id) => selectVariant(KIT, id, "medium").facade));
  assert.equal(facades.size, 3);
});

test("a kit missing the size class falls back to any variant instead of failing", () => {
  const onlyLarge = Object.freeze({ ...KIT, houses: KIT.houses.filter((h) => h.sizeClass === "large") });
  assert.equal(selectVariant(onlyLarge, "prop_a", "small").sizeClass, "large");
  assert.throws(() => selectVariant(Object.freeze({ ...KIT, houses: [] }), "prop_a", "small"), /no variants/);
});

test("the interior template exposes door, counter, NPC station, shelves and display slots inside the room", () => {
  for (const h of KIT.houses) {
    const t = interiorTemplate(h);
    assert.equal(t.variantId, h.id);
    assert.deepEqual(t.door.position, h.door.position);
    assert.ok(inside(t.npcStation.position, t.bounds), `${h.id} station inside`);
    assert.ok(inside(t.counter.position, t.bounds), `${h.id} counter inside`);
    assert.equal(t.displaySlots.length, h.slots.length);
    assert.ok(t.displaySlots.every((s) => inside(s.position, t.bounds)), `${h.id} slots inside`);
    const shelfSlots = t.shelves.flatMap((s) => s.slots);
    assert.deepEqual(shelfSlots.sort(), h.slots.filter((s) => s.surface === "shelf").map((s) => s.node).sort());
  }
});

test("the counter stands in front of the station along its facing", () => {
  const h = KIT.houses[0];
  const t = interiorTemplate(h);
  const [sx, , sz] = h.station.position;
  const [fx, , fz] = h.station.facing;
  assert.ok(Math.abs(t.counter.position[0] - (sx + fx * COUNTER_OFFSET)) < 1e-9);
  assert.ok(Math.abs(t.counter.position[2] - (sz + fz * COUNTER_OFFSET)) < 1e-9);
  assert.deepEqual(t.counter.facing, t.npcStation.facing);
});

test("display slots are ordered by slot number and shelves by height", () => {
  const t = interiorTemplate(KIT.houses.find((h) => h.sizeClass === "large")!);
  assert.deepEqual(t.displaySlots.map((s) => s.index), t.displaySlots.map((_, i) => i + 1));
  const ys = t.shelves.map((s) => s.y);
  assert.deepEqual(ys, [...ys].sort((p, q) => p - q));
  assert.ok(Object.isFrozen(t.displaySlots) && Object.isFrozen(t.shelves[0]));
});

test("placeHouse puts the variant door on the plot threshold, facing the plot outward vector", () => {
  const h = KIT.houses.find((v) => v.id === "house_medium_shutters")!;
  const plot = { door: { x: 10, z: -4, yaw: 0 }, outward: { x: 1, z: 0 } };
  const p = placeHouse(plot, h);
  assert.ok(Math.abs(p.yaw - Math.PI / 2) < 1e-9);
  const [dx, , dz] = h.door.position;
  const worldDoorX = p.position[0] + Math.cos(p.yaw) * dx + Math.sin(p.yaw) * dz;
  const worldDoorZ = p.position[2] - Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz;
  assert.ok(Math.abs(worldDoorX - 10) < 1e-9 && Math.abs(worldDoorZ + 4) < 1e-9);
});

test("placeHouse with a zero outward vector uses the plot yaw", () => {
  const h = KIT.houses[0];
  const p = placeHouse({ door: { x: 0, z: 0, yaw: 1.25 }, outward: { x: 0, z: 0 } }, h);
  assert.equal(p.yaw, 1.25);
});
