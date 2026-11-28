// K3 product display kit: checks the exported GLB and manifest.
// Run: node --test blender/tests/k3_product_kit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_DIR = join(ROOT, 'app', 'public', 'kits', 'k3');
const MAX_GLB_BYTES = 5 * 1024 * 1024;
const MAX_KIT_TRIANGLES = 120_000;
const MAX_PRODUCT_TRIANGLES = 12_000;
const BANNED = ['dangg', 'openpoker', 'test builder', 'workshop'];

const contract = JSON.parse(readFileSync(join(ROOT, 'shared', 'contracts', 'product-categories.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(KIT_DIR, 'manifest.json'), 'utf8'));

function readGlb(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'glTF magic');
  assert.equal(buf.readUInt32LE(4), 2, 'glTF version 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'first chunk is JSON');
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  return { buf, json };
}

const glbPath = join(KIT_DIR, manifest.glb);
const { buf, json: gltf } = readGlb(glbPath);
const meshIndex = (name) => gltf.meshes.findIndex((m) => m.name === name);
const nodeByName = (name) => gltf.nodes.find((n) => n.name === name);
const parentOf = (name) => {
  const idx = gltf.nodes.findIndex((n) => n.name === name);
  return gltf.nodes.find((n) => (n.children ?? []).includes(idx));
};
const meshTriangles = (mesh) =>
  mesh.primitives.reduce((sum, p) => {
    const count = p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count;
    return sum + count / 3;
  }, 0);
const meshBounds = (mesh) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.primitives) {
    const acc = gltf.accessors[p.attributes.POSITION];
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], acc.min[i]);
      max[i] = Math.max(max[i], acc.max[i]);
    }
  }
  return { min, max, size: max.map((v, i) => v - min[i]) };
};

test('manifest covers every contract category in order, plus a fallback', () => {
  assert.equal(manifest.kit, 'k3-product-display');
  assert.deepEqual(manifest.categories.map((c) => c.id), contract.categories.map((c) => c.id));
  assert.ok(manifest.fallback?.product, 'fallback product');
  assert.ok(manifest.slot_envelope_m?.length === 3, 'slot envelope recorded');
});

test('GLB is under 5 MB and has no Draco compression', () => {
  assert.ok(statSync(glbPath).size < MAX_GLB_BYTES, `size ${statSync(glbPath).size}`);
  const ext = [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])];
  assert.ok(!ext.includes('KHR_draco_mesh_compression'), 'no Draco');
});

test('one shared mesh per category product and per fixture (instancing-ready)', () => {
  const entries = [...manifest.categories, { id: 'fallback', ...manifest.fallback }];
  for (const c of entries) {
    const names = gltf.meshes.filter((m) => m.name === c.product);
    assert.equal(names.length, 1, `exactly one mesh ${c.product}`);
    assert.equal(gltf.meshes.filter((m) => m.name === c.fixture).length, 1, `exactly one mesh ${c.fixture}`);
    const display = nodeByName(c.display);
    assert.ok(display, `display node ${c.display}`);
    const kids = (display.children ?? []).map((i) => gltf.nodes[i]);
    assert.ok(kids.some((n) => n.mesh === meshIndex(c.product)), `${c.display} uses ${c.product}`);
    assert.ok(kids.some((n) => n.mesh === meshIndex(c.fixture)), `${c.display} uses ${c.fixture}`);
  }
  const shared = manifest.categories.filter((c) => c.display_kind === 'counter');
  assert.ok(shared.length >= 2, 'drink and food share the counter');
  const counterNodes = shared.map((c) => (nodeByName(c.display).children ?? []).map((i) => gltf.nodes[i]).find((n) => n.name.endsWith('.fixture')));
  assert.equal(new Set(counterNodes.map((n) => n.mesh)).size, 1, 'counter mesh reused, not duplicated');
});

test('each category has a price-tag anchor under its display that matches the manifest', () => {
  for (const c of manifest.categories) {
    const anchor = nodeByName(c.price_tag_anchor.node);
    assert.ok(anchor, c.price_tag_anchor.node);
    assert.equal(anchor.mesh, undefined, 'anchor is an empty');
    assert.equal(parentOf(c.price_tag_anchor.node)?.name, c.display);
    const t = anchor.translation ?? [0, 0, 0];
    c.price_tag_anchor.runtime_offset.forEach((v, i) => assert.ok(Math.abs(v - t[i]) < 1e-3, `${c.id} anchor axis ${i}`));
    const z = c.price_tag_anchor.runtime_offset[2];
    assert.ok(z > 0, `${c.id} tag faces the visitor (runtime +z)`);
  }
  assert.ok(gltf.meshes.some((m) => m.name === manifest.price_tag.mesh), 'blank price tag mesh');
});

test('products fit their fixture footprint and the slot envelope', () => {
  const [sw, sd, sh] = manifest.slot_envelope_m;
  for (const c of manifest.categories) {
    const p = meshBounds(gltf.meshes[meshIndex(c.product)]);
    const f = meshBounds(gltf.meshes[meshIndex(c.fixture)]);
    // runtime is y-up: footprint is x and z
    assert.ok(p.size[0] <= f.size[0] + 1e-3 && p.size[2] <= f.size[2] + 1e-3, `${c.id} footprint`);
    assert.ok(f.size[0] <= sw + 1e-3 && f.size[2] <= sd + 1e-3 && f.size[1] <= sh + 1e-3, `${c.fixture} in slot`);
    assert.ok(c.product_offset[1] + p.max[1] <= sh + 1e-3, `${c.id} below slot top`);
    assert.ok(p.min[1] > -1e-3, `${c.id} origin at its base`);
  }
});

test('triangle budget holds', () => {
  const total = gltf.meshes.reduce((s, m) => s + meshTriangles(m), 0);
  assert.ok(total <= MAX_KIT_TRIANGLES, `kit triangles ${total}`);
  for (const c of manifest.categories) {
    const tris = meshTriangles(gltf.meshes[meshIndex(c.product)]);
    assert.ok(tris <= MAX_PRODUCT_TRIANGLES, `${c.product} triangles ${tris}`);
  }
});

test('identity-free: no merchant names anywhere in the GLB or manifest', () => {
  const haystack = (buf.toString('latin1') + JSON.stringify(manifest)).toLowerCase();
  for (const word of BANNED) assert.ok(!haystack.includes(word), `found "${word}"`);
});
