/**
 * B3 ↔ B2 plot contract: once the slice manifest carries runtime_layout.plots
 * (B2), every street plot id in shared/contracts/house-plots.json must be a
 * manifest door plot, or joinHouseDirectory places none of the seeded houses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const contract = readJson("../../../shared/contracts/house-plots.json") as { plots: { id: string }[]; salon_plots: string[] };
const manifest = readJson("../../public/slice/manifest.json") as { runtime_layout?: { plots?: { id: string }[] } };
const manifestPlots = manifest.runtime_layout?.plots;

test("every contract street plot is a manifest door plot, and the salon plot is not", { skip: manifestPlots ? false : "B2 has not exported runtime_layout.plots yet" }, () => {
  const ids = new Set((manifestPlots ?? []).map((p) => p.id));
  for (const { id } of contract.plots) assert.ok(ids.has(id), `manifest is missing plot ${id}`);
  for (const id of contract.salon_plots) assert.ok(!ids.has(id), `salon plot ${id} must not be a street door`);
});
