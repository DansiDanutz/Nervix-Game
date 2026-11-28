/**
 * B2 → B3/B4 wiring against the shipped manifest: the parsed plots replace NO_PLOTS. Mirrors the
 * pure steps of worldDirectory (useWorldDirectory.ts imports React, so Node cannot load it).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { WorldHouse } from "../net/api/world.ts";
import { arrival, danggDoor, parseSliceManifest, stepBack, testBuilderDoor } from "../scene/slice.ts";
import { joinHouseDirectory } from "./houseDirectory.ts";
import { builtPlotIds, clearOfSightline } from "./plotGuards.ts";
import { housesOnPlots } from "./merchantHousePlan.ts";

const raw = JSON.parse(readFileSync(new URL("../../public/slice/manifest.json", import.meta.url), "utf8"));
const layout = parseSliceManifest(raw, "public/slice/manifest.json");
const plots = layout.plots!;
const plaza = layout.plaza!;

const listed = (propertyId: string, plotId: string): WorldHouse =>
  Object.freeze({ plotId, propertyId, merchantName: `Merchant ${propertyId}`, verified: true, theme: "merchant_house", accent: "#123456" });
/** The fixture directory shape: Test Builder on slot-12, DanGG in the salon (slot-11), demo houses on 14..18. */
const HOUSES = Object.freeze([
  listed("prop_dangg", "slot-11"), listed("prop_test", "slot-12"), listed("prop_s1", "slot-14"),
  listed("prop_d15", "slot-15"), listed("prop_d16", "slot-16"), listed("prop_d17", "slot-17"), listed("prop_d18", "slot-18"),
]);

test("the Test Builder house becomes the slot-12 plot door at the Blender house threshold", () => {
  const view = joinHouseDirectory({ houses: HOUSES, plots, fallbackDoors: [testBuilderDoor(layout)] });
  const door = view.doors.find((d) => d.propertyId === "prop_test")!;
  assert.equal(door.id, "slot-12");
  assert.deepEqual(door.position, [plaza.testBuilderDoor.x, 0, plaza.testBuilderDoor.z]);
  assert.ok(Math.abs(door.yaw! - plaza.testBuilderDoor.yaw) < 1e-6);
  // Leaving it puts the player where the legacy bld_test exit did.
  const back = arrival({ kind: "plaza" }, { kind: "house", door, from: "plaza" }, layout);
  const legacy = stepBack(plaza.testBuilderDoor);
  assert.ok(Math.abs(back.x - legacy.x) < 1e-6 && Math.abs(back.z - legacy.z) < 1e-6);
});

test("the unverified merchant's plot (slot-13) is closed, DanGG is unplaced on the plaza and stays in the salon", () => {
  const view = joinHouseDirectory({ houses: HOUSES, plots, fallbackDoors: [testBuilderDoor(layout)] });
  assert.deepEqual(view.closedPlots, ["slot-13"]);
  assert.deepEqual(view.unplaced, ["prop_dangg"]);
  const salon = joinHouseDirectory({ houses: HOUSES, plots: [], fallbackDoors: [danggDoor(layout)] });
  assert.deepEqual(salon.doors.map((d) => d.id), ["bld_dangg"]);
});

test("every shipped plot is a Blender-modelled facade, so no runtime K2 house or NPC is drawn inside one", () => {
  const modelled = plots.filter((p) => p.built !== false).map((p) => p.id);
  const built = builtPlotIds(plots, [plaza.testBuilderDoor, layout.facadeDoor], ["bld_test", "bld_dangg", ...modelled]);
  assert.equal(built.size, plots.length);
  const street = clearOfSightline(plots, plaza.spawn, plaza.fountain);
  assert.ok(!street.some((p) => p.id === "slot-12"), "slot-12 is on the arrival sightline corridor");
  assert.deepEqual(housesOnPlots(HOUSES, street, built), []);
});

test("a plot exported with built: false is a street lot for a runtime K2 house", () => {
  const lot = { ...raw.runtime_layout.plots[3], built: false };
  const withLot = parseSliceManifest({ ...raw, runtime_layout: { ...raw.runtime_layout, plots: [lot] } }, "m.json").plots!;
  const built = builtPlotIds(withLot, [plaza.testBuilderDoor, layout.facadeDoor], withLot.filter((p) => p.built !== false).map((p) => p.id));
  const street = clearOfSightline(withLot, plaza.spawn, plaza.fountain);
  assert.deepEqual(housesOnPlots(HOUSES, street, built).map((h) => h.house.propertyId), ["prop_d15"]);
});
