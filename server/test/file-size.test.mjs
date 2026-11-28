/** F0 ceiling: no server source file (src, seed) is over 400 lines. */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAX_LINES = 400;

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".mjs") ? [path] : [];
  });
}

test("every server source file is at most 400 lines", () => {
  const over = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "seed"))]
    .map((f) => [f.slice(ROOT.length), readFileSync(f, "utf8").split("\n").length])
    .filter(([, n]) => n > MAX_LINES);
  assert.deepEqual(over, []);
});
