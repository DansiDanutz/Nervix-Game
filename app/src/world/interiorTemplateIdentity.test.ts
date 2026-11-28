/**
 * B4: merchant identity is runtime data. No K2 GLB (or its manifest) may carry
 * a fixture merchant name; the signboard paints names at runtime instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = join(HERE, "../../public/kits/k2");
const FIXTURES = join(HERE, "../../../server/seed/fixtures");

async function fixtureNames(): Promise<string[]> {
  const merchants = await import(pathToFileURL(join(FIXTURES, "merchants.mjs")).href);
  const directory = await import(pathToFileURL(join(FIXTURES, "directory.mjs")).href);
  const names = [
    ...merchants.MERCHANTS.map((m: readonly unknown[]) => String(m[2])),
    ...directory.DIRECTORY_MERCHANTS.map((m: readonly unknown[]) => String(m[1])),
  ];
  // Also match the bare name without the "(demo)" suffix, the likeliest baked form.
  return [...new Set(names.flatMap((n) => [n, n.replace(/\s*\(demo\)\s*$/i, "")]))].filter((n) => n.length >= 4);
}

const kitFiles = (dir = KIT_DIR) => readdirSync(dir).filter((f) => f.endsWith(".glb") || f === "manifest.json");

function identityHits(dir: string, names: readonly string[]): string[] {
  const lower = names.map((n) => n.toLowerCase());
  return kitFiles(dir).flatMap((file) => {
    const bytes = readFileSync(join(dir, file));
    const text = `${bytes.toString("latin1")}\n${bytes.toString("utf8")}`.toLowerCase();
    return lower.filter((n) => text.includes(n)).map((n) => `${file}: ${n}`);
  });
}

test("the fixture name list is not empty (guards against a vacuous scan)", async () => {
  const names = await fixtureNames();
  assert.ok(names.includes("DanGG") && names.includes("Lantern Books"), names.join(", "));
  assert.equal(kitFiles().filter((f) => f.endsWith(".glb")).length, 9);
});

test("the scan catches a planted name (guards against a scan that never fires)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "k2-scan-"));
  try {
    writeFileSync(join(dir, "house_planted.glb"), Buffer.from("glTF\u0000node:sign_board text:DANGG"));
    assert.deepEqual(identityHits(dir, await fixtureNames()), ["house_planted.glb: dangg"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no K2 GLB or manifest contains a fixture merchant name", async () => {
  assert.deepEqual(identityHits(KIT_DIR, await fixtureNames()), []);
});
