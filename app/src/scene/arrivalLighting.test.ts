// Run from app/: node --test src/scene/arrivalLighting.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { arrivalRig, DEFAULT_SKY_ZENITH, FILL_INTENSITY, GRADE, hsl, mixHex } from "./arrivalLighting.ts";
import type { PlazaLighting } from "./slice.ts";

const LIGHTING: PlazaLighting = {
  background: "#f6c4a0",
  fog: { color: "#efc3a3", near: 70, far: 460 },
  sun: { position: [30, 26, 44], color: "#ffc280", intensity: 2.9 },
  hemisphere: { sky: "#fbd1b0", ground: "#a8775c", intensity: 0.86 },
};

test("without exported sky stops the dome runs from the background to a desaturated default zenith", () => {
  const rig = arrivalRig(LIGHTING);
  assert.equal(rig.sky.horizon, "#f6c4a0");
  assert.equal(rig.sky.mid, undefined);
  assert.equal(rig.sky.zenith, mixHex(DEFAULT_SKY_ZENITH, GRADE.skyZenithTint, GRADE.skyZenithMix));
});

test("exported horizon wins; the mid stop is a darkened peach-gold, never mauve or lilac", () => {
  const three = arrivalRig({ ...LIGHTING, skyGradient: { horizon: "#ffc892", mid: "#f2b0b2", zenith: "#8fb2e4" } });
  assert.equal(three.sky.horizon, "#ffc892");
  const mid = hsl(three.sky.mid!);
  assert.ok(mid.h >= 12 && mid.h <= 40, `mid hue ${mid.h} is warm peach-gold (mauve would be ~340)`);
  assert.ok(mid.l < hsl("#f2b0b2").l - 0.08, `mid lightness ${mid.l} darkened (the game sky read 0.12 too light)`);
  assert.ok(mid.s > 0.2 && mid.s < 0.45, `mid saturation ${mid.s}: warm but muted, not grey`);
});

test("the zenith is desaturated to Blender's sky-top saturation (S <= 0.15)", () => {
  const rig = arrivalRig({ ...LIGHTING, skyGradient: { horizon: "#ffc892", mid: "#f2b0b2", zenith: "#8fb2e4" } });
  const zenith = hsl(rig.sky.zenith);
  assert.ok(zenith.s <= 0.15, `zenith saturation ${zenith.s}`);
  assert.ok(zenith.l > 0.7, `zenith lightness ${zenith.l}: a pale sky, not a dusk`);
});

test("hemisphere sky moves from lavender toward warm rose-peach (never the blue zenith) over a terracotta ground", () => {
  const rig = arrivalRig({ ...LIGHTING, hemisphere: { ...LIGHTING.hemisphere, sky: "#cfc4d8" }, skyGradient: { horizon: "#ffc892", zenith: "#8fb2e4" } });
  const sky = hsl(rig.hemisphere.sky);
  // Warm rose to peach: hue wraps through red (>= 330 or <= 40); lavender is ~270, the blue zenith ~215.
  assert.ok(sky.h >= 330 || sky.h <= 40, `hemisphere sky hue ${sky.h} is warm (lavender is ~270)`);
  assert.ok(hsl(rig.hemisphere.sky).l > hsl("#cfc4d8").l - 0.05, "not darkened");
  assert.notEqual(rig.hemisphere.sky, "#ffc892", "part-way to peach, not the saturated horizon (crimson paving)");
  const before = hsl("#a8775c");
  const after = hsl(rig.hemisphere.ground);
  assert.ok(after.s >= before.s + 0.08, `ground saturation ${after.s} vs ${before.s}: shaded walls keep their colour`);
  assert.ok(after.h >= 15 && after.h <= 35, `ground hue ${after.h} is terracotta`);
  assert.ok(rig.hemisphere.intensity > 0.86 * 0.9 && rig.hemisphere.intensity < 0.86 * 1.1);
});

test("warm key light: raised 15-25% over the exported sun, pulled toward amber, same direction", () => {
  const rig = arrivalRig(LIGHTING);
  const gain = rig.sun.intensity / LIGHTING.sun.intensity;
  assert.ok(gain >= 1.15 && gain <= 1.25, `sun gain ${gain}`);
  const before = hsl(LIGHTING.sun.color);
  const after = hsl(rig.sun.color);
  assert.ok(after.l < before.l, `sun ${rig.sun.color} is deeper amber than ${LIGHTING.sun.color}`);
  assert.ok(after.h >= 25 && after.h <= 40, `sun hue ${after.h} is golden amber`);
  assert.deepEqual(rig.sun.position, LIGHTING.sun.position);
});

test("fog is warmed toward peach and pushed back past the hill (Blender has no mist)", () => {
  const rig = arrivalRig(LIGHTING);
  assert.equal(rig.fog.near, LIGHTING.fog.near * GRADE.fogNearScale);
  assert.equal(rig.fog.far, LIGHTING.fog.far * GRADE.fogFarScale);
  assert.ok(rig.fog.near >= 200, `fog starts beyond the hill (${rig.fog.near} m)`);
  const before = hsl(LIGHTING.fog.color);
  const after = hsl(rig.fog.color);
  assert.ok(after.h > before.h, `fog hue ${after.h} warmer than ${before.h}`);
});

test("fill light sits opposite the sun, lower, at low intensity", () => {
  const rig = arrivalRig(LIGHTING);
  assert.deepEqual(rig.fill.position, [-30, 13, -44]);
  assert.ok(rig.fill.intensity >= FILL_INTENSITY && rig.fill.intensity < LIGHTING.sun.intensity / 5);
});

test("an exported fill is tinted toward a warm amber bounce instead of neutral blue-grey", () => {
  const rig = arrivalRig({ ...LIGHTING, fill: { color: "#b9c2e0", intensity: 0.35 } });
  assert.equal(rig.fill.color, mixHex("#b9c2e0", GRADE.fillTint, GRADE.fillMix));
  const { h, s } = hsl(rig.fill.color);
  assert.ok(h > 20 && h < 45, `fill hue ${h} is amber, not blue or plum`);
  assert.ok(s > 0.4, `fill saturation ${s}`);
  assert.ok(rig.fill.intensity > 0.35 && rig.fill.intensity < LIGHTING.sun.intensity / 4);
  assert.deepEqual(rig.fill.position, [-30, 13, -44]);
});

test("colour helpers: mixHex endpoints and hsl of primaries; bad colours throw", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.deepEqual(hsl("#ff0000"), { h: 0, s: 1, l: 0.5 });
  assert.equal(hsl("#0000ff").h, 240);
  assert.throws(() => mixHex("red", "#ffffff", 0.5));
});

test("the manifest lighting object is not mutated", () => {
  const copy = structuredClone(LIGHTING);
  arrivalRig(LIGHTING);
  assert.deepEqual(LIGHTING, copy);
});
