import test from "node:test";
import assert from "node:assert/strict";
import { builtPlotIds, clearOfSightline, SIGHTLINE_HALF_WIDTH } from "./plotGuards.ts";

const plot = (id: string, x: number, z: number) =>
  Object.freeze({ id, door: Object.freeze({ x, z, yaw: 0 }), sizeClass: "medium", outward: Object.freeze({ x: 0, z: 1 }) });

const SPAWN = Object.freeze({ x: 19, z: 0.6 });
const FOUNTAIN = Object.freeze({ x: 0, z: 0 });

test("a plot whose door sits on a Blender-built door is built; others are not", () => {
  const plots = [plot("slot-12", 15.2, 3.6), plot("slot-15", -20, 8)];
  const built = builtPlotIds(plots, [{ x: 15, z: 3.7 }]);
  assert.deepEqual([...built], ["slot-12"]);
});

test("a plot id that equals an existing door id counts as built", () => {
  const built = builtPlotIds([plot("bld_test", 40, 40)], [], ["bld_test"]);
  assert.deepEqual([...built], ["bld_test"]);
});

test("no plots and no built doors: nothing is built", () => {
  assert.equal(builtPlotIds([], [{ x: 1, z: 1 }]).size, 0);
});

test("a plot inside the spawn-to-fountain corridor is dropped; one beside it stays", () => {
  const onLine = plot("slot-a", 10, 0.3);
  const beside = plot("slot-b", 10, 0.3 + SIGHTLINE_HALF_WIDTH + 1);
  const kept = clearOfSightline([onLine, beside], SPAWN, FOUNTAIN);
  assert.deepEqual(kept.map((p) => p.id), ["slot-b"]);
});

test("a plot beyond either end of the sightline segment is kept", () => {
  const behindSpawn = plot("slot-c", 26, 0.6);
  const pastFountain = plot("slot-d", -12, 0);
  assert.deepEqual(clearOfSightline([behindSpawn, pastFountain], SPAWN, FOUNTAIN).map((p) => p.id), ["slot-c", "slot-d"]);
});

test("the guards never mutate their inputs and return frozen results", () => {
  const plots = Object.freeze([plot("slot-a", 10, 0.3), plot("slot-b", 30, 30)]);
  const kept = clearOfSightline(plots, SPAWN, FOUNTAIN);
  assert.ok(Object.isFrozen(kept));
  assert.equal(plots.length, 2);
});

test("a degenerate sightline (spawn on the fountain) only drops plots near that point", () => {
  const kept = clearOfSightline([plot("near", 0.5, 0), plot("far", 20, 0)], FOUNTAIN, FOUNTAIN);
  assert.deepEqual(kept.map((p) => p.id), ["far"]);
});
