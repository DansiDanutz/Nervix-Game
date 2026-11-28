import test from "node:test";
import assert from "node:assert/strict";
import type { HouseDoor } from "../scene/HouseDoors.ts";
import type { WorldHouse } from "../net/api/world.ts";
import { joinHouseDirectory, loadWorldHouses, type SlicePlot } from "./houseDirectory.ts";

const house = (n: string, plotId = `plot_${n}`): WorldHouse =>
  Object.freeze({ plotId, propertyId: `prop_${n}`, merchantName: `Merchant ${n}`, verified: true, theme: "merchant_house", accent: "#123456" });
const plot = (id: string, x = 1, z = 2, yaw = 0.5): SlicePlot =>
  Object.freeze({ id, door: Object.freeze({ x, z, yaw }), sizeClass: "medium", outward: Object.freeze({ x: 0, z: 1 }) });
const legacy = (id: string, propertyId: string): HouseDoor =>
  ({ id, propertyId, owner: "usr_legacy", label: "Legacy label", position: [6, 0, 4], colour: "#2f6f6a", trim: "#b5486b", yaw: 1 });

test("with manifest plots, each listed house gets a door at its plot, in manifest order", () => {
  const view = joinHouseDirectory({ houses: [house("b"), house("a")], plots: [plot("plot_a", 3, 4, 1.5), plot("plot_b", 5, 6, 0)], fallbackDoors: [] });
  assert.deepEqual(view.doors.map((d) => d.propertyId), ["prop_a", "prop_b"]);
  const [a] = view.doors;
  assert.equal(a.id, "plot_a");
  assert.equal(a.label, "Merchant a");
  assert.deepEqual(a.position, [3, 0, 4]);
  assert.equal(a.yaw, 1.5);
  assert.equal(a.colour, "#123456");
  assert.equal(a.owner, "");
  assert.deepEqual(view.closedPlots, []);
});

test("an empty plot is closed; a listed house without a manifest plot is unplaced (e.g. the salon house)", () => {
  const view = joinHouseDirectory({ houses: [house("a"), house("salon", "slot-11")], plots: [plot("plot_a"), plot("plot_empty")], fallbackDoors: [] });
  assert.deepEqual(view.doors.map((d) => d.id), ["plot_a"]);
  assert.deepEqual(view.closedPlots, ["plot_empty"]);
  assert.deepEqual(view.unplaced, ["prop_salon"]);
});

test("a third house appears with no client change: one more directory entry, one more door", () => {
  const plots = [plot("plot_a"), plot("plot_b"), plot("plot_c")];
  const two = joinHouseDirectory({ houses: [house("a"), house("b")], plots, fallbackDoors: [] });
  const three = joinHouseDirectory({ houses: [house("a"), house("b"), house("c")], plots, fallbackDoors: [] });
  assert.equal(two.doors.length, 2);
  assert.equal(three.doors.length, 3);
  assert.deepEqual(two.closedPlots, ["plot_c"]);
});

test("a duplicate manifest plot id is used once", () => {
  const view = joinHouseDirectory({ houses: [house("a")], plots: [plot("plot_a", 1), plot("plot_a", 9)], fallbackDoors: [] });
  assert.deepEqual(view.doors.map((d) => d.position[0]), [1]);
});

test("without manifest plots, the legacy doors are kept only for listed houses, labelled from the directory", () => {
  const fallbackDoors = [legacy("bld_test", "prop_a"), legacy("bld_gone", "prop_gone")];
  for (const plots of [undefined, null, []]) {
    const view = joinHouseDirectory({ houses: [house("a"), house("z")], plots, fallbackDoors });
    assert.deepEqual(view.doors.map((d) => d.id), ["bld_test"]);
    assert.equal(view.doors[0].label, "Merchant a");
    assert.deepEqual(view.doors[0].position, [6, 0, 4]);
    assert.equal(view.doors[0].colour, "#2f6f6a");
    assert.deepEqual(view.closedPlots, []);
    assert.deepEqual(view.unplaced, ["prop_z"]);
  }
});

test("a directory that has not loaded (null) opens no door: nothing can be entered before the listing is known", () => {
  // A suspended or unlisted merchant's legacy door must not be enterable while GET /world/houses is in flight.
  const fallbackDoors = [legacy("bld_test", "prop_a"), legacy("bld_dangg", "prop_dangg")];
  const view = joinHouseDirectory({ houses: null, plots: [plot("plot_a")], fallbackDoors });
  assert.deepEqual(view.doors, []);
  assert.deepEqual(view.closedPlots, ["plot_a"]);
  assert.ok(Object.isFrozen(view.doors));
  const salon = joinHouseDirectory({ houses: null, plots: [], fallbackDoors });
  assert.deepEqual(salon.doors, []);
});

test("an empty directory closes every plot and every legacy door (suspend, reload, door gone)", () => {
  const view = joinHouseDirectory({ houses: [], plots: [plot("plot_a")], fallbackDoors: [legacy("bld_test", "prop_a")] });
  assert.deepEqual(view.doors, []);
  assert.deepEqual(view.closedPlots, ["plot_a"]);
  const legacyOnly = joinHouseDirectory({ houses: [], plots: [], fallbackDoors: [legacy("bld_test", "prop_a")] });
  assert.deepEqual(legacyOnly.doors, []);
});

test("the join never mutates its inputs and returns frozen output", () => {
  const houses = Object.freeze([house("a")]);
  const plots = Object.freeze([plot("plot_a")]);
  const fallbackDoors = Object.freeze([Object.freeze(legacy("bld_test", "prop_a"))]);
  const view = joinHouseDirectory({ houses, plots, fallbackDoors });
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.doors) && Object.isFrozen(view.doors[0]));
  assert.ok(Object.isFrozen(view.closedPlots) && Object.isFrozen(view.unplaced));
  const viaFallback = joinHouseDirectory({ houses, plots: [], fallbackDoors });
  assert.notEqual(viaFallback.doors[0], fallbackDoors[0]);
  assert.equal(fallbackDoors[0].label, "Legacy label");
});

test("loadWorldHouses returns the fetched list on success", async () => {
  const houses = Object.freeze([house("a")]);
  assert.equal(await loadWorldHouses(async () => houses), houses);
});

test("loadWorldHouses fails closed: a rejected fetch gives [] and the join then draws no door", async () => {
  const failed = await loadWorldHouses(async () => { throw new Error("network down"); });
  assert.deepEqual(failed, []);
  assert.ok(Object.isFrozen(failed));
  const view = joinHouseDirectory({ houses: failed, plots: [], fallbackDoors: [legacy("bld_test", "prop_a")] });
  assert.deepEqual(view.doors, []);
});

test("loadWorldHouses reports the error to the optional callback", async () => {
  const seen: unknown[] = [];
  const boom = new Error("blocked");
  await loadWorldHouses(async () => { throw boom; }, (e) => seen.push(e));
  assert.deepEqual(seen, [boom]);
});
