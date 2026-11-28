// Export contract tests for the K2 house kit (GLBs + manifest in app/public/kits/k2/).
// Run: node --test blender/tests/k2-house-kit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_DIR = join(ROOT, 'app', 'public', 'kits', 'k2');
const MANIFEST = join(KIT_DIR, 'manifest.json');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TRIANGLES = 350_000;
const BANNED = ['dangg', 'openpoker', 'test builder', 'test_builder', 'nervixpay', 'usr_', 'demo_'];
const SIZES = ['small', 'medium', 'large'];
const FACADES = ['shutters', 'awning', 'loggia'];

function loadManifest() {
  assert.ok(existsSync(MANIFEST), `missing ${MANIFEST}`);
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function parseGlb(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(buf.readUInt32LE(4), 2, 'glTF version 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'first chunk is JSON');
  return { json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')), bytes: buf.length };
}

function triangleCount(gltf) {
  let tris = 0;
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const prim of gltf.meshes[node.mesh].primitives) {
      const mode = prim.mode ?? 4;
      assert.equal(mode, 4, 'triangles only');
      const acc = prim.indices !== undefined ? gltf.accessors[prim.indices] : gltf.accessors[prim.attributes.POSITION];
      tris += acc.count / 3;
    }
  }
  return tris;
}

function nodesByName(gltf) {
  return new Map((gltf.nodes ?? []).map((n, i) => [n.name, { ...n, index: i }]));
}

function close(a, b, eps = 1e-3) {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= eps, `${a} vs ${b}`));
}

test('manifest lists 3 size classes x 3 facades with categories', () => {
  const m = loadManifest();
  assert.equal(m.kit, 'k2_house_kit');
  assert.deepEqual(m.categories.size_class, SIZES);
  assert.deepEqual(m.categories.facade, FACADES);
  assert.equal(m.houses.length, 9);
  const combos = new Set(m.houses.map((h) => `${h.size_class}/${h.facade}`));
  assert.equal(combos.size, 9);
});

test('every GLB exists, is under 5 MB, has no Draco and stays in the triangle budget', () => {
  const m = loadManifest();
  for (const h of m.houses) {
    const path = join(KIT_DIR, h.file);
    assert.ok(existsSync(path), `missing ${h.file}`);
    assert.ok(statSync(path).size < MAX_BYTES, `${h.file} too large`);
    const { json } = parseGlb(path);
    const used = [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])];
    assert.ok(!used.includes('KHR_draco_mesh_compression'), `${h.file} uses Draco`);
    const tris = triangleCount(json);
    assert.ok(tris > 1000 && tris < MAX_TRIANGLES, `${h.file} triangles ${tris}`);
    assert.equal(h.triangles, tris, `${h.file} manifest triangle count`);
  }
});

test('anchors and slots exist as nodes and match the manifest', () => {
  const m = loadManifest();
  for (const h of m.houses) {
    const { json } = parseGlb(join(KIT_DIR, h.file));
    const nodes = nodesByName(json);
    const root = nodes.get(h.id);
    assert.ok(root, `${h.file} root node ${h.id}`);
    assert.ok(!root.translation || root.translation.every((v) => Math.abs(v) < 1e-6), 'root at origin');
    const kids = new Set((root.children ?? []).map((i) => json.nodes[i].name));
    for (const key of ['door', 'sign', 'station']) {
      const a = h.anchors[key];
      const n = nodes.get(a.node);
      assert.ok(n, `${h.file} missing ${a.node}`);
      assert.ok(kids.has(a.node), `${a.node} is a direct child of the root`);
      close(n.translation ?? [0, 0, 0], a.position);
      assert.equal(n.extras?.k2_anchor, key);
    }
    const door = h.anchors.door;
    close(door.outward, [0, 0, 1]);
    close(nodes.get('anchor_door').extras.outward, door.outward);
    assert.ok(h.slots.length >= 6 && h.slots.length <= 12, `${h.file} slot count`);
    h.slots.forEach((s, i) => {
      assert.equal(s.node, `slot_${i + 1}`);
      const n = nodes.get(s.node);
      assert.ok(n, `${h.file} missing ${s.node}`);
      assert.ok(kids.has(s.node));
      close(n.translation ?? [0, 0, 0], s.position);
      assert.equal(n.extras?.k2_slot, i + 1);
    });
    for (const part of h.parts) assert.ok(nodes.has(part), `${h.file} missing part ${part}`);
    for (const opt of h.options) assert.ok(nodes.has(opt.node), `${h.file} missing option ${opt.node}`);
    assert.ok(nodes.has('sign_board'), 'blank sign board mesh');
  }
});

test('door anchor sits on the front facade and the interior is behind it', () => {
  const m = loadManifest();
  for (const h of m.houses) {
    const d = h.anchors.door.position;
    assert.ok(Math.abs(d[2]) < 0.05, `${h.id} door on facade plane z=0`);
    const b = h.interior.bounds;
    assert.ok(b.max[2] < 0 && b.min[2] < b.max[2], `${h.id} interior behind the facade (runtime -z)`);
    for (const s of h.slots) {
      assert.ok(s.position[0] > b.min[0] && s.position[0] < b.max[0]);
      assert.ok(s.position[2] > b.min[2] && s.position[2] < b.max[2]);
    }
  }
});

test('kit is identity-free: no merchant names or ids in manifest or GLBs', () => {
  const texts = [readFileSync(MANIFEST, 'utf8')];
  for (const h of loadManifest().houses) {
    texts.push(readFileSync(join(KIT_DIR, h.file)).toString('latin1'));
  }
  for (const t of texts) {
    const lower = t.toLowerCase();
    for (const token of BANNED) assert.ok(!lower.includes(token), `found banned token ${token}`);
  }
});
