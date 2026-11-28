import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NPC_ROLE, VERIFIED_AFFILIATION, merchantNpcs, npcDebugView, npcLabelLines, placeStreetNpcs, stationPose,
  type MerchantNpc, type StationFrame,
} from "./merchantNpcs.ts";
import { parseWorldHouses, type WorldHouse } from "../net/api/world.ts";
import { parseK2, placeHouse, selectVariant } from "./interiorTemplate.ts";
import type { SlicePlot } from "./houseDirectory.ts";

const PRESETS = ["teal", "terracotta", "burgundy", "linen", "traveller", "sage"] as const;
const kit = parseK2(JSON.parse(readFileSync(new URL("../../public/kits/k2/manifest.json", import.meta.url), "utf8")));

const house = (propertyId: string, plotId: string, merchantName: string): WorldHouse =>
  Object.freeze({ plotId, propertyId, merchantName, verified: true, theme: "merchant_house", accent: "#c98b3a" });

const DANGG = house("prop_dangg", "slot-11", "DanGG");
const TEST = house("prop_test", "slot-12", "Test Builder");

const plot = (id: string, x: number, z: number, outward: { x: number; z: number }): SlicePlot =>
  Object.freeze({ id, door: { x, z, yaw: 0 }, sizeClass: "small", outward });

/** The real B4 placement: K2 variant for the house, root pose on the plot, station anchor. */
const frameOf = (npc: MerchantNpc, p: SlicePlot): StationFrame => {
  const variant = selectVariant(kit, npc.propertyId, p.sizeClass);
  const pose = placeHouse(p, variant);
  return { position: pose.position, yaw: pose.yaw, station: variant.station };
};

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("one NPC per listed house, named from the API and labelled AI representative", () => {
  const npcs = merchantNpcs([DANGG, TEST], PRESETS);
  assert.deepEqual(npcs.map((n) => [n.propertyId, n.name, n.role, n.affiliation]), [
    ["prop_dangg", "DanGG", NPC_ROLE, VERIFIED_AFFILIATION],
    ["prop_test", "Test Builder", NPC_ROLE, VERIFIED_AFFILIATION],
  ]);
  assert.equal(NPC_ROLE, "AI representative");
  assert.deepEqual(npcLabelLines(npcs[1]), ["Test Builder", "AI representative"]);
  assert.ok(Object.isFrozen(npcs) && Object.isFrozen(npcs[0]));
});

test("no NPC for an unverified entry, even if one slips past the parser; duplicates keep the first", () => {
  const unverified = { ...house("prop_unverified", "slot-13", "Unverified Shop"), verified: false } as unknown as WorldHouse;
  const npcs = merchantNpcs([DANGG, unverified, { ...DANGG, merchantName: "Copy" }], PRESETS);
  assert.deepEqual(npcs.map((n) => n.name), ["DanGG"]);
});

test("the API parser plus merchantNpcs: unverified and malformed directory rows never get an NPC", () => {
  const body = { houses: [DANGG, TEST, { ...house("prop_unverified", "slot-13", "Unverified Shop"), verified: false }, { propertyId: "x" }] };
  const names = merchantNpcs(parseWorldHouses(body), PRESETS).map((n) => n.name);
  assert.deepEqual(names, ["DanGG", "Test Builder"]);
});

test("no names are invented: an empty directory has no NPCs", () => {
  assert.deepEqual(merchantNpcs([], PRESETS), []);
});

test("the preset is a contract preset, chosen deterministically from the property id", () => {
  const a = merchantNpcs([DANGG, TEST], PRESETS);
  const b = merchantNpcs([TEST, DANGG], PRESETS);
  for (const n of a) assert.ok(PRESETS.includes(n.preset as (typeof PRESETS)[number]));
  assert.equal(a[0].preset, b[1].preset);
  assert.equal(merchantNpcs([DANGG], []).at(0)?.preset, "teal", "falls back to the first contract preset id");
});

test("stationPose maps a variant-local station to world space with three.js rotation.y", () => {
  const station = { node: "anchor_station", position: [1, 0.12, -4] as const, facing: [0, 0, 1] as const };
  const pose = stationPose({ position: [10, 0, 5], yaw: Math.PI / 2, station });
  // rotation.y = +90°: local (x, z) -> (z, -x); local +z faces world +x.
  close(pose.position[0], 10 - 4);
  close(pose.position[1], 0.12);
  close(pose.position[2], 5 - 1);
  close(pose.heading, Math.PI / 2);
  const local = stationPose({ position: [0, 0, 0], yaw: 0, station });
  assert.deepEqual(local.position, [1, 0.12, -4]);
  close(local.heading, 0);
});

test("street NPCs stand at the K2 station inside their house and face out of the facade", () => {
  const plots = [plot("slot-12", 20, 6, { x: 0, z: -1 }), plot("slot-15", -5, 10, { x: 1, z: 0 })];
  const npcs = merchantNpcs([DANGG, TEST], PRESETS);
  const placed = placeStreetNpcs(npcs, plots, frameOf);
  assert.deepEqual(placed.map((p) => p.npc.propertyId), ["prop_test"], "DanGG has no street plot (its house is in the salon)");
  const [testNpc] = placed;
  const variant = selectVariant(kit, "prop_test", "small");
  const [dx, , dz] = variant.door.position;
  const [sx, , sz] = variant.station.position;
  close(Math.hypot(testNpc.position[0] - 20, testNpc.position[2] - 6), Math.hypot(sx - dx, sz - dz), 1e-6);
  assert.ok(testNpc.position[2] > 6, "behind the facade, away from the street (outward is -z)");
  close(Math.sin(testNpc.heading), 0, 1e-6);
  close(Math.cos(testNpc.heading), -1, 1e-6);
});

test("a frame that cannot be resolved drops only that NPC", () => {
  const plots = [plot("slot-11", 0, 0, { x: 0, z: 1 }), plot("slot-12", 5, 0, { x: 0, z: 1 })];
  const placed = placeStreetNpcs(merchantNpcs([DANGG, TEST], PRESETS), plots, (npc, p) => (npc.propertyId === "prop_dangg" ? null : frameOf(npc, p)));
  assert.deepEqual(placed.map((p) => p.npc.name), ["Test Builder"]);
});

test("debug view lists every NPC with its label and whether it is placed, and no ids beyond the property", () => {
  const npcs = merchantNpcs([DANGG, TEST], PRESETS);
  const placed = placeStreetNpcs(npcs, [plot("slot-12", 5, 0, { x: 0, z: 1 })], frameOf);
  const view = npcDebugView(npcs, placed);
  assert.deepEqual(view, [
    { propertyId: "prop_dangg", name: "DanGG", role: NPC_ROLE, affiliation: VERIFIED_AFFILIATION, placed: false },
    { propertyId: "prop_test", name: "Test Builder", role: NPC_ROLE, affiliation: VERIFIED_AFFILIATION, placed: true },
  ]);
  assert.doesNotMatch(JSON.stringify(view), /usr_|mer_/);
});
