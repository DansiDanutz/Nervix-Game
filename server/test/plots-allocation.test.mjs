/**
 * B1 repair, unit level: allocateHouse over a scripted fake pool, so the race
 * windows the integration tests can only hit by chance are exercised exactly.
 *  - A plot locked after another transaction committed a house on it (stale
 *    statement snapshot) is re-checked and skipped, not double-booked.
 *  - Only plot/slot unique conflicts are retried, with a bound above 3.
 *  - Any other unique conflict (a merchant already bound elsewhere) is a
 *    cross_owner denial on the first attempt, never a retried 500.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { allocateHouse } from "../src/store/plots.mjs";
import { AccessError } from "../src/entitlement.mjs";

const PLOT = (id) => Object.freeze({ id, district: "merchant-quarter", template: "merchant_house" });
const REQUEST = Object.freeze({ userId: "usr_fake", merchantId: "mer_fake", businessType: "merchant" });

const uniqueViolation = (constraint) => Object.assign(new Error(`duplicate key ${constraint}`), { code: "23505", constraint });

/**
 * A fake pg pool. `plots` is the sequence the locking SELECT returns, `taken`
 * the plot ids the post-lock re-check reports as already housed, and
 * `insertErrors` the errors the house INSERT throws, in order.
 */
function fakePool({ plots = [PLOT("slot-01")], taken = [], insertErrors = [] } = {}) {
  const state = { connects: 0, rechecked: [], inserted: [], plots: [...plots], insertErrors: [...insertErrors] };
  const query = async (sql, values = []) => {
    if (/SKIP LOCKED/.test(sql)) return { rows: state.plots.length ? [state.plots.shift()] : [] };
    if (/AS taken/.test(sql)) {
      state.rechecked.push(values[0]);
      return { rows: [{ taken: taken.includes(values[0]) }] };
    }
    if (/INSERT INTO properties/.test(sql)) {
      const error = state.insertErrors.shift();
      if (error) throw error;
      state.inserted.push(values[3]);
      return { rows: [] };
    }
    if (/SELECT merchant_id FROM properties/.test(sql)) return { rows: [{ merchant_id: REQUEST.merchantId }] };
    return { rows: [] };
  };
  const pool = { connect: async () => { state.connects += 1; return { query, release: () => {} }; } };
  return { store: { pool }, state };
}

test("a plot found housed on the post-lock re-check is skipped for the next free one", async () => {
  const { store, state } = fakePool({ plots: [PLOT("slot-01"), PLOT("slot-02")], taken: ["slot-01"] });
  const { property, created } = await allocateHouse(store, REQUEST);
  assert.equal(created, true);
  assert.equal(property.plotId, "slot-02");
  assert.deepEqual(state.rechecked, ["slot-01", "slot-02"]);
  assert.deepEqual(state.inserted, ["slot-02"]);
  assert.equal(state.connects, 1, "no retry was needed");
});

test("every plot housed on re-check means no free plot, not a double booking", async () => {
  const { store } = fakePool({ plots: [PLOT("slot-01")], taken: ["slot-01"] });
  await assert.rejects(allocateHouse(store, REQUEST), { name: "ProvisioningError" });
});

test("a plot or slot unique conflict is retried beyond three attempts", async () => {
  const errors = [
    uniqueViolation("properties_plot_id_key"), uniqueViolation("properties_slot_id_key"),
    uniqueViolation("properties_plot_id_key"), uniqueViolation("properties_slot_id_key"),
  ];
  const plots = Array.from({ length: 5 }, (_, i) => PLOT(`slot-0${i + 1}`));
  const { store, state } = fakePool({ plots, insertErrors: errors });
  const { property, created } = await allocateHouse(store, REQUEST);
  assert.equal(created, true);
  assert.equal(property.plotId, "slot-05");
  assert.equal(state.connects, 5);
});

test("a merchant already bound to another house is cross_owner on the first attempt", async () => {
  const { store, state } = fakePool({ insertErrors: [uniqueViolation("properties_one_house_per_merchant")] });
  await assert.rejects(allocateHouse(store, REQUEST), (error) => error instanceof AccessError && error.code === "cross_owner");
  assert.equal(state.connects, 1, "a non-plot conflict is never retried");
});

test("a conflict that keeps recurring still ends, with the database error", async () => {
  const errors = Array.from({ length: 50 }, () => uniqueViolation("properties_plot_id_key"));
  const plots = Array.from({ length: 50 }, (_, i) => PLOT(`p-${i}`));
  const { store, state } = fakePool({ plots, insertErrors: errors });
  await assert.rejects(allocateHouse(store, REQUEST), { code: "23505" });
  assert.ok(state.connects > 3 && state.connects < 50, String(state.connects));
});
