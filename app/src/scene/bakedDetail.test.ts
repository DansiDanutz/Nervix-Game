// Run from app/: node --test src/scene/bakedDetail.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { RELIEF_MAX, RELIEF_MIN, SUNLIT_HIGH, SUNLIT_LOW, reliefFactor, smoothstep, sunlitWeight, surfaceDetail } from "./bakedDetail.ts";

test("baked stone, paving, roofs, cloth and pots get detail by their Blender name", () => {
  assert.ok(surfaceDetail("ar_ashlar_lm")!.relief > 0);
  assert.ok(surfaceDetail("ar_cobble_lm")!.cavity > 0);
  assert.ok(surfaceDetail("ar_roof_tiles_lm")!.macro > 0);
  assert.ok(surfaceDetail("ar_banner_cloth_lm")!.relief > 0);
  assert.ok(surfaceDetail("ar_clay_pot_lm")!.glaze > 0);
  assert.equal(surfaceDetail("ar_cobble_lm#baked"), surfaceDetail("ar_cobble"));
});

test("paints, glass, metals and unknown names get none", () => {
  for (const name of ["ar_teal_lm", "ar_gold_lm", "ar_lamp_glass", "ar_water", "", undefined]) assert.equal(surfaceDetail(name), null, String(name));
});

test("sunlit weight ramps from shaded to sunlit bake levels", () => {
  assert.equal(sunlitWeight(SUNLIT_LOW - 0.1), 0);
  assert.equal(sunlitWeight(SUNLIT_HIGH + 0.1), 1);
  assert.ok(Math.abs(sunlitWeight((SUNLIT_LOW + SUNLIT_HIGH) / 2) - 0.5) < 1e-9);
  assert.equal(smoothstep(0, 1, 0.25), 0.15625);
});

test("relief leaves a flat texel exactly as baked", () => {
  const d = { relief: 1, cavity: 0.5 };
  assert.equal(reliefFactor({ base: 0.7, bent: 0.7, facing: 1, sunlit: 1 }, d), 1);
});

test("sun-facing bumps brighten only where the bake is sunlit", () => {
  const d = { relief: 1, cavity: 0 };
  assert.ok(reliefFactor({ base: 0.5, bent: 0.8, facing: 1, sunlit: 1 }, d) > 1.25);
  assert.equal(reliefFactor({ base: 0.5, bent: 0.8, facing: 1, sunlit: 0 }, d), 1);
  assert.ok(reliefFactor({ base: 0.5, bent: 0.2, facing: 1, sunlit: 1 }, d) < 0.75);
});

test("grooves darken in shade as well as sun, within the clamp", () => {
  const d = { relief: 0, cavity: 0.5 };
  assert.equal(reliefFactor({ base: 0, bent: 0, facing: 0.6, sunlit: 0 }, d), 0.8);
  assert.equal(reliefFactor({ base: 1, bent: 0, facing: -1, sunlit: 1 }, { relief: 5, cavity: 5 }), RELIEF_MIN);
  assert.equal(reliefFactor({ base: 0, bent: 1, facing: 1, sunlit: 1 }, { relief: 5, cavity: 0 }), RELIEF_MAX);
});
