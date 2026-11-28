import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { k2OptionVisible, SIGN_BOARD_MATERIAL, signSurfaceMeshes, type SceneNode } from "./signboardSurface.ts";

const KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/kits/k2");
const GLB_JSON_CHUNK_OFFSET = 20;

interface GltfJson {
  readonly nodes: readonly { name?: string; mesh?: number; children?: number[]; extras?: Record<string, unknown> }[];
  readonly meshes: readonly { name?: string; primitives: readonly { material?: number }[] }[];
  readonly materials: readonly { name?: string }[];
  readonly scenes: readonly { nodes: readonly number[] }[];
}

function glbJson(file: string): GltfJson {
  const bytes = readFileSync(join(KIT_DIR, file));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(GLB_JSON_CHUNK_OFFSET, GLB_JSON_CHUNK_OFFSET + length).toString("utf8"));
}

/** three's PropertyBinding.sanitizeNodeName: whitespace to "_", reserved chars dropped. */
const sanitize = (name: string) => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

/**
 * The tree three's GLTFLoader builds from the glTF JSON: a node whose mesh has
 * several primitives becomes a Group (named after the node) holding one Mesh
 * per primitive, each named after the *mesh* plus `_<i>`; a one-primitive mesh
 * is the node itself. Extras land in userData, as does the original node name.
 */
function loaderTree(json: GltfJson, index: number): SceneNode {
  const def = json.nodes[index];
  const name = sanitize(def.name ?? "");
  const userData = { ...(def.extras ?? {}), name: def.name };
  const children = (def.children ?? []).map((i) => loaderTree(json, i));
  if (def.mesh === undefined) return { name, userData, children };
  const mesh = json.meshes[def.mesh];
  const prim = (p: { material?: number }, suffix: string): SceneNode => ({
    name: suffix ? `${sanitize(mesh.name ?? "")}${suffix}` : name,
    isMesh: true,
    material: { name: json.materials[p.material ?? 0]?.name ?? "" },
    userData: suffix ? {} : userData,
    children: suffix ? [] : children,
  });
  if (mesh.primitives.length === 1) return prim(mesh.primitives[0], "");
  return { name, userData, children: [...mesh.primitives.map((p, i) => prim(p, `_${i}`)), ...children] };
}

const sceneOf = (json: GltfJson): SceneNode => ({ name: "Scene", children: json.scenes[0].nodes.map((i) => loaderTree(json, i)) });
const K2_FILES = readdirSync(KIT_DIR).filter((f) => f.endsWith(".glb"));

test("every K2 GLB: exactly one sign mesh is found, the blank board, never the wood frame", () => {
  assert.equal(K2_FILES.length, 9);
  for (const file of K2_FILES) {
    const hits = signSurfaceMeshes(sceneOf(glbJson(file)), "sign_board");
    assert.equal(hits.length, 1, file);
    assert.equal((hits[0].material as { name: string }).name, SIGN_BOARD_MATERIAL, file);
  }
});

test("the K2 sign node is a multi-primitive Group, so a name-only Mesh match finds nothing (the B4 bug)", () => {
  const scene = sceneOf(glbJson(K2_FILES[0]));
  const nameOnly: SceneNode[] = [];
  const walk = (n: SceneNode) => {
    if (n.isMesh && n.name === "sign_board") nameOnly.push(n);
    n.children.forEach(walk);
  };
  walk(scene);
  assert.equal(nameOnly.length, 0);
});

const mesh = (name: string, material: string): SceneNode => ({ name, isMesh: true, material: { name: material }, children: [] });

test("a Group with two Mesh children: only the board-material child is returned", () => {
  const board = mesh("house_xsign_board_0", "k2_sign_blank");
  const frame = mesh("house_xsign_board_1", "k2_wood_dark");
  const root: SceneNode = { name: "root", children: [{ name: "sign_board", children: [board, frame] }] };
  assert.deepEqual(signSurfaceMeshes(root, "sign_board"), [board]);
});

test("a one-primitive sign node is itself the mesh", () => {
  const board = mesh("sign_board", "k2_sign_blank");
  assert.deepEqual(signSurfaceMeshes({ name: "root", children: [board] }, "sign_board"), [board]);
});

test("the sign node is found by its original glTF name when the scene name was sanitised", () => {
  const board = mesh("x_0", "k2_sign_blank");
  const root: SceneNode = { name: "root", children: [{ name: "signboard", userData: { name: "sign.board" }, children: [board] }] };
  assert.deepEqual(signSurfaceMeshes(root, "sign.board"), [board]);
});

test("board material elsewhere in the house is ignored; a missing node or material yields []", () => {
  const decoy = mesh("wall_plaque", "k2_sign_blank");
  const frameOnly: SceneNode = { name: "sign_board", children: [mesh("f", "k2_wood_dark")] };
  assert.deepEqual(signSurfaceMeshes({ name: "root", children: [decoy, frameOnly] }, "sign_board"), []);
  assert.deepEqual(signSurfaceMeshes({ name: "root", children: [decoy] }, "sign_board"), []);
});

test("an explicit board material name overrides the K2 default", () => {
  const board = mesh("b", "custom_board");
  const root: SceneNode = { name: "root", children: [{ name: "sign_board", children: [board, mesh("f", "k2_sign_blank")] }] };
  assert.deepEqual(signSurfaceMeshes(root, "sign_board", "custom_board"), [board]);
});

test("the returned list is frozen and the tree is not modified", () => {
  const board = mesh("b", "k2_sign_blank");
  const root: SceneNode = { name: "root", children: [{ name: "sign_board", children: [board] }] };
  const before = JSON.stringify(root);
  const hits = signSurfaceMeshes(root, "sign_board");
  assert.ok(Object.isFrozen(hits));
  assert.equal(JSON.stringify(root), before);
});

test("k2OptionVisible: options follow k2_default_visible (default shown); non-options are untouched", () => {
  assert.equal(k2OptionVisible({ k2_option: true, k2_default_visible: true }), true);
  assert.equal(k2OptionVisible({ k2_option: true, k2_default_visible: false }), false);
  assert.equal(k2OptionVisible({ k2_option: true }), true);
  assert.equal(k2OptionVisible({ k2_anchor: "door" }), undefined);
  assert.equal(k2OptionVisible(undefined), undefined);
});

test("K2 GLBs: every optional node is a k2_option the helper decides on", () => {
  for (const file of K2_FILES) {
    const opts = glbJson(file).nodes.filter((n) => n.name?.startsWith("opt_"));
    for (const n of opts) assert.equal(typeof k2OptionVisible(n.extras), "boolean", `${file} ${n.name}`);
  }
});
