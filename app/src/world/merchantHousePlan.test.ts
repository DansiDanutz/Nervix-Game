import test from "node:test";
import assert from "node:assert/strict";
import { housesOnPlots, merchantHouseName } from "./merchantHousePlan.ts";

const plot = (id: string) => ({ id, sizeClass: "small" });
const house = (propertyId: string, plotId: string) => ({ propertyId, plotId });

test("each house is paired with its manifest plot; a house whose plot is missing is skipped", () => {
  const plots = [plot("p1"), plot("p2")];
  const pairs = housesOnPlots([house("prop_a", "p1"), house("prop_b", "nope"), house("prop_c", "p2")], plots);
  assert.deepEqual(pairs.map((p) => [p.house.propertyId, p.plot.id]), [["prop_a", "p1"], ["prop_c", "p2"]]);
  assert.ok(Object.isFrozen(pairs));
});

test("plots already built in the scene are excluded (no double draw)", () => {
  const pairs = housesOnPlots([house("prop_a", "p1"), house("prop_b", "p2")], [plot("p1"), plot("p2")], new Set(["p1"]));
  assert.deepEqual(pairs.map((p) => p.house.propertyId), ["prop_b"]);
});

test("no houses or no plots draw nothing", () => {
  assert.deepEqual(housesOnPlots([], [plot("p1")]), []);
  assert.deepEqual(housesOnPlots([house("prop_a", "p1")], []), []);
});

test("the scene node is named merchant_house_<propertyId>", () => {
  assert.equal(merchantHouseName("prop_dangg"), "merchant_house_prop_dangg");
});
