/**
 * C8 acceptance: no merchant display name is baked into a Blender scene or an exported GLB.
 * NPC names come only from GET /world/houses at runtime. The .blend files are zstd-compressed,
 * so they are decompressed before the search. Names come from the server fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";
import { MERCHANTS } from "../../../server/seed/fixtures/merchants.mjs";
import { DIRECTORY_MERCHANTS } from "../../../server/seed/fixtures/directory.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;

const names = [
  ...(MERCHANTS as readonly (readonly [string, string, string, boolean])[]).map(([, , name]) => name),
  ...(DIRECTORY_MERCHANTS as readonly (readonly [string, string, string])[]).map(([, name]) => name.replace(/\s*\(demo\)$/, "")),
];

const filesIn = (dir: string, ext: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : []);

function text(path: string): string {
  const raw = readFileSync(join(ROOT, path));
  const body = raw.subarray(0, 4).equals(ZSTD_MAGIC) ? zstd!(raw) : raw;
  return body.toString("latin1");
}

const hits = (files: readonly string[]) =>
  files.flatMap((f) => {
    const body = text(f);
    return names.filter((n) => body.includes(n)).map((n) => `${n} in ${f}`);
  });

test("the fixture name list is the one the API serves (sanity)", () => {
  assert.ok(names.includes("DanGG") && names.includes("Test Builder") && names.includes("Unverified Shop"));
  assert.ok(names.length >= 7);
});

test("no merchant display name in any exported GLB", () => {
  const glbs = [...filesIn("app/public/slice", ".glb"), ...filesIn("app/public/kits", ".glb")];
  assert.ok(glbs.length > 0);
  assert.deepEqual(hits(glbs), []);
});

test("no merchant display name in any Blender scene", { skip: zstd ? false : "this Node has no zlib.zstdDecompressSync" }, () => {
  const blends = filesIn("blender/scenes", ".blend");
  assert.ok(blends.length > 0);
  assert.deepEqual(hits(blends), []);
});
