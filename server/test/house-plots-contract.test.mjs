/**
 * B3 plot-id contract: the plot ids the seed puts houses on are published in
 * shared/contracts/house-plots.json, and B2 must export manifest door plots
 * with exactly these ids (app/src/world/housePlots.test.ts checks the manifest).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DIRECTORY_HOUSES } from "../seed/fixtures/directory.mjs";
import { PROPERTIES } from "../seed/fixtures/merchants.mjs";

const contract = JSON.parse(readFileSync(new URL("../../shared/contracts/house-plots.json", import.meta.url), "utf8"));
const streetIds = () => contract.plots.map((p) => p.id);

test("house-plots is a frozen, versioned contract with unique street plot ids", () => {
  assert.equal(contract.contract, "house-plots");
  assert.equal(contract.version, 1);
  assert.equal(contract.frozen, true);
  const ids = streetIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["slot-12", "slot-13", "slot-14", "slot-15", "slot-16", "slot-17", "slot-18"]);
  assert.deepEqual(contract.salon_plots, ["slot-11"]);
});

test("every seeded directory house stands on a contract street plot", () => {
  for (const h of DIRECTORY_HOUSES) assert.ok(streetIds().includes(h.plotId), h.plotId);
});

test("every slice fixture house is on a contract plot; the salon house is never a street plot", () => {
  for (const [propertyId, , , plot] of PROPERTIES) {
    const inSalon = contract.salon_plots.includes(plot);
    assert.ok(inSalon || streetIds().includes(plot), `${propertyId} ${plot}`);
    assert.ok(!(inSalon && streetIds().includes(plot)), plot);
  }
});
