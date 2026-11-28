/**
 * B3 ↔ B2 plot contract: the slice manifest carries runtime_layout.plots (B2),
 * and every street plot id in shared/contracts/house-plots.json must be a
 * manifest door plot, or joinHouseDirectory places none of the seeded houses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSliceManifest } from "../scene/slice.ts";

const readJson = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const contract = readJson("../../../shared/contracts/house-plots.json") as { plots: { id: string }[]; salon_plots: string[] };
const layout = parseSliceManifest(readJson("../../public/slice/manifest.json"), "public/slice/manifest.json");

test("the manifest plots are exactly the contract street plots, in contract order", () => {
  assert.ok(layout.plots, "runtime_layout.plots is exported (B2)");
  assert.deepEqual(layout.plots.map((p) => p.id), contract.plots.map((p) => p.id));
});

test("the salon plot is never a street door", () => {
  const ids = new Set((layout.plots ?? []).map((p) => p.id));
  for (const id of contract.salon_plots) assert.ok(!ids.has(id), `salon plot ${id} must not be a street door`);
});
