// K1 character kit: contract test on the exported GLB and its manifest (no dependencies).
// Run: node --test blender/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KIT_DIR = join(ROOT, "app", "public", "kits", "k1");
const MANIFEST_PATH = join(KIT_DIR, "manifest.json");
const CONTRACT_PATH = join(ROOT, "shared", "contracts", "avatar-presets.json");
const SHEET_PATH = join(ROOT, "docs", "evidence", "kits", "k1-sheet.png");

const MAX_GLB_BYTES = 5 * 1024 * 1024;
const MAX_TRIS = 8000;
const TARGET_HEIGHT = 1.8;
const HEIGHT_TOLERANCE = 0.05;
const REQUIRED_CLIPS = ["idle", "walk", "run", "talk"];
const REQUIRED_SLOTS = ["skin", "hair", "eyes", "tunic", "trim", "legs", "leather", "accent"];
const REQUIRED_JOINTS = ["root", "hips", "spine", "chest", "neck", "head", "upper_arm_L", "forearm_L",
  "hand_L", "upper_arm_R", "forearm_R", "hand_R", "thigh_L", "shin_L", "foot_L", "thigh_R", "shin_R", "foot_R"];
const REQUIRED_ANCHORS = ["label", "head_top", "hand_L", "hand_R", "back", "hip_R"];
const EXCLUSIVE_CATEGORIES = ["garment", "hair"];
// Identity-free: nothing merchant-specific may be baked into the kit.
const FORBIDDEN_WORDS = ["dangg", "openpoker", "test builder", "merchant_", "usr_", "demo_"];
const HEX = /^#[0-9a-f]{6}$/;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const glbPath = join(KIT_DIR, manifest.glb);
const gltf = parseGlb(readFileSync(glbPath));

function parseGlb(buf) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "GLB magic");
  assert.equal(buf.readUInt32LE(4), 2, "GLB version 2");
  const jsonLength = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, "first chunk is JSON");
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
}

function nodeNames() {
  return new Set((gltf.nodes ?? []).map((n) => n.name));
}

function meshTriangles(mesh) {
  return mesh.primitives.reduce((sum, p) => {
    const count = p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count;
    return sum + count / 3;
  }, 0);
}

function trianglesByNode() {
  const out = new Map();
  for (const node of gltf.nodes) {
    if (node.mesh !== undefined) out.set(node.name, meshTriangles(gltf.meshes[node.mesh]));
  }
  return out;
}

test("manifest names the kit and a GLB under 5 MB", () => {
  assert.equal(manifest.kit, "k1");
  assert.equal(manifest.category, "character");
  assert.ok(existsSync(glbPath), `missing ${glbPath}`);
  assert.ok(statSync(glbPath).size < MAX_GLB_BYTES, `GLB is ${statSync(glbPath).size} bytes`);
});

test("GLB is not Draco-compressed", () => {
  const used = [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])];
  assert.ok(!used.includes("KHR_draco_mesh_compression"), `extensions: ${used.join(",")}`);
});

test("GLB carries one skin with the named joints", () => {
  assert.equal(gltf.skins?.length, 1);
  const joints = new Set(gltf.skins[0].joints.map((i) => gltf.nodes[i].name));
  for (const name of REQUIRED_JOINTS) assert.ok(joints.has(name), `joint ${name}`);
  assert.deepEqual([...manifest.skeleton.joints].sort(), [...REQUIRED_JOINTS].sort());
});

test("GLB has idle, walk, run and talk clips that match the manifest", () => {
  const names = (gltf.animations ?? []).map((a) => a.name);
  for (const clip of REQUIRED_CLIPS) assert.ok(names.includes(clip), `clip ${clip} in ${names}`);
  for (const clip of REQUIRED_CLIPS) {
    const entry = manifest.clips.find((c) => c.name === clip);
    assert.ok(entry, `manifest clip ${clip}`);
    assert.equal(entry.loop, true);
    const anim = gltf.animations.find((a) => a.name === clip);
    const duration = Math.max(...anim.samplers.map((s) => gltf.accessors[s.input].max[0]));
    assert.ok(Math.abs(duration - entry.duration_s) < 0.05, `${clip}: ${duration} vs ${entry.duration_s}`);
  }
  const walk = manifest.clips.find((c) => c.name === "walk");
  const run = manifest.clips.find((c) => c.name === "run");
  assert.ok(run.speed_mps > walk.speed_mps, "run is faster than walk");
});

test("every manifest part is a skinned mesh node in the GLB", () => {
  const names = nodeNames();
  for (const part of manifest.parts) {
    assert.ok(names.has(part.node), `part node ${part.node}`);
    const node = gltf.nodes.find((n) => n.name === part.node);
    assert.equal(node.skin, 0, `${part.node} is skinned`);
    assert.ok(["base", "garment", "hair", "accessory"].includes(part.category), part.category);
  }
});

test("every anchor exists as a node", () => {
  const names = nodeNames();
  for (const anchor of REQUIRED_ANCHORS) {
    const entry = manifest.anchors.find((a) => a.name === anchor);
    assert.ok(entry, `manifest anchor ${anchor}`);
    assert.ok(names.has(entry.node), `anchor node ${entry.node}`);
    assert.ok(REQUIRED_JOINTS.includes(entry.bone), `anchor bone ${entry.bone}`);
  }
});

test("materials cover every slot and the manifest maps each slot to one", () => {
  const materials = new Set((gltf.materials ?? []).map((m) => m.name));
  for (const slot of REQUIRED_SLOTS) {
    assert.ok(manifest.material_slots[slot], `slot ${slot}`);
    assert.ok(materials.has(manifest.material_slots[slot]), `material ${manifest.material_slots[slot]}`);
  }
});

test("whole kit and every preset stay under 8k triangles", () => {
  const tris = trianglesByNode();
  const total = [...tris.values()].reduce((a, b) => a + b, 0);
  assert.ok(total < MAX_TRIS, `all parts: ${total}`);
  for (const preset of manifest.presets) {
    const shown = manifest.parts.filter((p) => p.category === "base" || preset.parts.includes(p.id));
    const sum = shown.reduce((a, p) => a + tris.get(p.node), 0);
    assert.ok(sum < MAX_TRIS, `${preset.id}: ${sum}`);
  }
});

test("bind-pose height is 1.8 m and matches the manifest", () => {
  let top = -Infinity;
  let bottom = Infinity;
  for (const mesh of gltf.meshes) {
    for (const p of mesh.primitives) {
      const acc = gltf.accessors[p.attributes.POSITION];
      top = Math.max(top, acc.max[1]);
      bottom = Math.min(bottom, acc.min[1]);
    }
  }
  assert.ok(Math.abs(bottom) < 0.02, `feet at ${bottom}`);
  assert.ok(Math.abs(top - TARGET_HEIGHT) < HEIGHT_TOLERANCE, `top at ${top}`);
  assert.ok(Math.abs(manifest.height_m - TARGET_HEIGHT) < HEIGHT_TOLERANCE);
});

test("4 to 6 presets, each complete and well-formed", () => {
  const partIds = new Set(manifest.parts.map((p) => p.id));
  assert.ok(manifest.presets.length >= 4 && manifest.presets.length <= 6, `${manifest.presets.length}`);
  assert.equal(new Set(manifest.presets.map((p) => p.id)).size, manifest.presets.length, "unique ids");
  for (const preset of manifest.presets) {
    for (const slot of REQUIRED_SLOTS) assert.match(preset.palette[slot] ?? "", HEX, `${preset.id}.${slot}`);
    for (const id of preset.parts) assert.ok(partIds.has(id), `${preset.id} part ${id}`);
    for (const category of EXCLUSIVE_CATEGORIES) {
      const chosen = manifest.parts.filter((p) => p.category === category && preset.parts.includes(p.id));
      assert.equal(chosen.length, 1, `${preset.id} has exactly one ${category}`);
    }
  }
});

test("contract presets are reused verbatim", () => {
  for (const cp of contract.presets) {
    const kp = manifest.presets.find((p) => p.id === cp.id);
    assert.ok(kp, `contract preset ${cp.id} in kit`);
    for (const [key, value] of Object.entries(cp.palette)) assert.equal(kp.palette[key], value, `${cp.id}.${key}`);
  }
});

test("kit is identity-free", () => {
  const text = (JSON.stringify(manifest) + JSON.stringify(gltf)).toLowerCase();
  for (const word of FORBIDDEN_WORDS) assert.ok(!text.includes(word), `contains ${word}`);
});

test("contact sheet evidence exists", () => {
  assert.ok(existsSync(SHEET_PATH), SHEET_PATH);
  assert.ok(statSync(SHEET_PATH).size > 10_000);
});
