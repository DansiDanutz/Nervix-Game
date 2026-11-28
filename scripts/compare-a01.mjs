#!/usr/bin/env node
/**
 * A01 strip (reference | Blender CAM_A01 | game ?cam=a01) and SSIM / ΔE support metrics.
 *
 * Run from the repository root:  node scripts/compare-a01.mjs [--game PATH] [...]
 *
 * No PNG library is installed in app/ (no pngjs or sharp), so the image work lives in
 * scripts/compare_a01.py (Pillow only). This entry point checks the inputs, runs it with the
 * same arguments and fails loudly when Python or Pillow is missing.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "compare_a01.py");
const python = process.env.PYTHON ?? "python3";

const probe = spawnSync(python, ["-c", "import PIL"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error(`compare-a01: ${python} with Pillow is required (${probe.error?.message ?? probe.stderr.trim()})`);
  process.exit(1);
}

const run = spawnSync(python, [script, ...process.argv.slice(2)], { stdio: "inherit" });
if (run.error) {
  console.error(`compare-a01: could not run ${script}: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);
