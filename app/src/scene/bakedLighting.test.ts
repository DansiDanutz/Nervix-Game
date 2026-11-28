// Run from app/: node --test src/scene/bakedLighting.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { aoBlendFor, bakeMode, bakedFraction, brokenLightmap, emissionColor, isSkyCard, lightmapFlag, lightmapEncoding, lightmapIntensity, pickLightmapSlot } from "./bakedLighting.ts";

const probe = (p: Partial<Parameters<typeof bakeMode>[0]>) => ({ basic: false, lightmapFlag: false, hasUv1: false, hasLightmapTexture: false, ...p });

test("KHR_materials_unlit (MeshBasicMaterial) is drawn as baked colour", () => {
  assert.equal(bakeMode(probe({ basic: true })), "unlit");
  assert.equal(bakeMode(probe({ basic: true, lightmapFlag: true, hasUv1: true, hasLightmapTexture: true })), "unlit");
});

test("a lightmap needs the flag, uv1 and a uv1 texture", () => {
  assert.equal(bakeMode(probe({ lightmapFlag: true, hasUv1: true, hasLightmapTexture: true })), "lightmap");
  assert.equal(bakeMode(probe({ lightmapFlag: true, hasUv1: false, hasLightmapTexture: true })), "lit");
  assert.equal(bakeMode(probe({ lightmapFlag: true, hasUv1: true, hasLightmapTexture: false })), "lit");
  assert.equal(bakeMode(probe({ hasUv1: true, hasLightmapTexture: true })), "lit");
});

test("a flagged mesh that cannot be honoured is reported as broken", () => {
  assert.equal(brokenLightmap(probe({ lightmapFlag: true })), true);
  assert.equal(brokenLightmap(probe({ lightmapFlag: true, hasUv1: true, hasLightmapTexture: true })), false);
  assert.equal(brokenLightmap(probe({})), false);
  assert.equal(brokenLightmap(probe({ basic: true, lightmapFlag: true })), false);
});

test("lightmap flag is read from any userData and must be exactly true", () => {
  assert.equal(lightmapFlag({}, { lightmap: true }), true);
  assert.equal(lightmapFlag({ lightmap: "true" }, null, undefined, 3), false);
  assert.equal(lightmapFlag(), false);
});

test("lightmap intensity defaults to 1 and rejects bad values", () => {
  assert.equal(lightmapIntensity({}), 1);
  assert.equal(lightmapIntensity({ lightmap_intensity: -2 }, { lightmap_intensity: 2.5 }), 2.5);
  assert.equal(lightmapIntensity({ lightmap_intensity: Number.NaN }), 1);
  assert.equal(lightmapIntensity({ lightmap_intensity: 99 }), 16);
});

test("the lightmap slot is the first one sampled on uv1", () => {
  assert.equal(pickLightmapSlot({ aoMap: { channel: 1 }, emissiveMap: { channel: 1 } }), "aoMap");
  assert.equal(pickLightmapSlot({ aoMap: { channel: 0 }, emissiveMap: { channel: 1 } }), "emissiveMap");
  assert.equal(pickLightmapSlot({ lightMap: { channel: 1 }, aoMap: { channel: 1 } }), "lightMap");
  assert.equal(pickLightmapSlot({ aoMap: { channel: 0 }, emissiveMap: null }), null);
});

test("screen-space AO fades as more of the scene carries baked AO", () => {
  assert.equal(aoBlendFor(0.8, 0), 0.8);
  assert.equal(aoBlendFor(0.8, 1), 0.2);
  assert.equal(aoBlendFor(0.8, 0.5), 0.5);
  assert.equal(aoBlendFor(0.8, 7), 0.2);
  assert.equal(bakedFraction({ baked: 3, total: 4 }), 0.75);
  assert.equal(bakedFraction({ baked: 0, total: 0 }), 0);
});

test("extras.lightmap_encoding decides how the lightmap texel is decoded", () => {
  assert.equal(lightmapEncoding("aoMap", { lightmap_encoding: "srgb" }), "srgb");
  assert.equal(lightmapEncoding("aoMap", { lightmap_encoding: "SRGB" }), "srgb");
  assert.equal(lightmapEncoding("emissiveMap", {}, { lightmap_encoding: "linear" }), "linear");
  assert.equal(lightmapEncoding("aoMap", { lightmap_encoding: "rgbm" }, { lightmap_encoding: "srgb" }), "srgb");
});

test("without an encoding the slot's glTF colour space is kept", () => {
  assert.equal(lightmapEncoding("aoMap"), "linear");
  assert.equal(lightmapEncoding("lightMap", null, 3), "linear");
  assert.equal(lightmapEncoding("emissiveMap", {}), "srgb");
});

test("cloud cards are recognised by material name only", () => {
  assert.equal(isSkyCard("ar_cloud"), true);
  assert.equal(isSkyCard("ar_cloud_shade"), true);
  assert.equal(isSkyCard("ar_cloudy_stone"), false);
  assert.equal(isSkyCard("ar_limestone"), false);
  assert.equal(isSkyCard(undefined), false);
});

test("emission colour scales by strength and ignores bad strengths", () => {
  assert.deepEqual(emissionColor([1, 0.5, 0.25], 1.4), [1.4, 0.7, 0.35]);
  assert.deepEqual(emissionColor([1, 0.5, 0.25], Number.NaN), [1, 0.5, 0.25]);
  assert.deepEqual(emissionColor([1, 0.5, 0.25], 0), [1, 0.5, 0.25]);
});
