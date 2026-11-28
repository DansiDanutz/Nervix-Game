// Run from app/: node --test src/scene/fountainWater.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { srgbToLinear, sunDirection, waterKind } from "./fountainWater.ts";

test("fountain meshes are classified by node name first", () => {
  assert.equal(waterKind(["fountain_water"], "ar_water"), "pool");
  assert.equal(waterKind(["fountain_water_inner"], undefined), "pool");
  assert.equal(waterKind(["fountain_falls"], "ar_water_fall"), "stream");
  assert.equal(waterKind(["Fountain_Jet_3"], undefined), "stream");
  assert.equal(waterKind(["fountain_splash"], "ar_water_foam"), "foam");
  assert.equal(waterKind(["fountain_falls_1", "fountain_falls"], "ar_cobble"), "stream");
});

test("the material name is the fallback; stone and planters are never water", () => {
  assert.equal(waterKind(["Mesh_12"], "ar_water"), "pool");
  assert.equal(waterKind(["fountain_basin"], "ar_fountain_stone"), null);
  assert.equal(waterKind(["fountain_planter_1"], undefined), null);
  assert.equal(waterKind([], undefined), null);
});

test("sRGB to linear matches the standard transfer curve", () => {
  assert.deepEqual(srgbToLinear("#000000"), [0, 0, 0]);
  assert.deepEqual(srgbToLinear("#ffffff"), [1, 1, 1]);
  const [mid] = srgbToLinear("#808080");
  assert.ok(Math.abs(mid - 0.2159) < 1e-3, String(mid));
  assert.throws(() => srgbToLinear("teal"));
});

test("sun direction is normalised", () => {
  const d = sunDirection([30.86, 25.93, 44.44]);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
  assert.ok(d[1] > 0.4 && d[1] < 0.45);
  assert.deepEqual(sunDirection([0, 0, 0]), [0, 1, 0]);
});
