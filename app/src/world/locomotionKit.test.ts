import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseK1Kit, resolvePreset, visiblePartNodes } from "./locomotionKit.ts";
import { RUN_CLIP_SPEED, WALK_CLIP_SPEED } from "./locomotion.ts";

const manifest = JSON.parse(readFileSync(new URL("../../public/kits/k1/manifest.json", import.meta.url), "utf8"));
const contract = JSON.parse(readFileSync(new URL("../../../shared/contracts/avatar-presets.json", import.meta.url), "utf8"));
const kit = parseK1Kit(manifest);

test("parses the shipped K1 manifest: GLB, slots, parts, presets and the three locomotion clips", () => {
  assert.equal(kit.glb, "k1_pedestrian.glb");
  assert.equal(kit.slots.tunic, "k1_tunic");
  assert.ok(kit.parts.some((p) => p.id === "body" && p.category === "base"));
  for (const name of ["idle", "walk", "run"]) assert.ok(kit.clips.some((c) => c.name === name), name);
  assert.ok(Object.isFrozen(kit) && Object.isFrozen(kit.presets) && Object.isFrozen(kit.clips));
});

test("locomotion clip speeds match the speeds the K1 clips were authored at", () => {
  assert.equal(kit.clips.find((c) => c.name === "walk")?.speedMps, WALK_CLIP_SPEED);
  assert.equal(kit.clips.find((c) => c.name === "run")?.speedMps, RUN_CLIP_SPEED);
});

test("every contract preset exists in the kit with the same parts and palette", () => {
  for (const preset of contract.presets) {
    const inKit = kit.presets.find((p) => p.id === preset.id);
    assert.ok(inKit, preset.id);
    assert.deepEqual([...inKit.parts], preset.parts);
    assert.deepEqual({ ...inKit.palette }, preset.palette);
  }
});

test("visiblePartNodes: base body plus exactly the preset's own parts", () => {
  const nodes = visiblePartNodes(kit, "teal");
  assert.deepEqual([...nodes].sort(), ["k1_body", "k1_hair_curly", "k1_satchel", "k1_tunic_knee"]);
  assert.ok(!nodes.has("k1_robe_long"));
});

test("resolvePreset: known ids pass through; unknown ids fall back to the first kit preset", () => {
  assert.equal(resolvePreset(kit, "sage"), "sage");
  assert.equal(resolvePreset(kit, "no-such-preset"), kit.presets[0].id);
  assert.equal(resolvePreset(kit, ""), kit.presets[0].id);
});

test("rejects a malformed manifest with a clear message and drops non-hex palette values", () => {
  assert.throws(() => parseK1Kit(null), /k1 manifest: not an object/);
  assert.throws(() => parseK1Kit({ ...manifest, glb: "" }), /glb/);
  assert.throws(() => parseK1Kit({ ...manifest, material_slots: [] }), /material_slots/);
  assert.throws(() => parseK1Kit({ ...manifest, clips: [{ name: "walk", speed_mps: -1 }] }), /clips\[0\]\.speed_mps/);
  assert.throws(() => parseK1Kit({ ...manifest, presets: [] }), /presets/);
  const odd = parseK1Kit({ ...manifest, presets: [{ id: "x", parts: [], palette: { tunic: "red", trim: "#c9993f" } }] });
  assert.deepEqual({ ...odd.presets[0].palette }, { trim: "#c9993f" });
});
