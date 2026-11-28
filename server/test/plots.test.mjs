/** B1 unit checks: plots replace the hard-coded slot table, and the dead builder guard is gone. */
import test from "node:test";
import assert from "node:assert/strict";

import * as guards from "../src/routes/guards.mjs";
import * as context from "../src/routes/context.mjs";
import { planProperty, ALLOCATION } from "../src/provision.mjs";

test("guards.mjs no longer exports the dead requireBuilderOwner", () => {
  assert.equal(guards.requireBuilderOwner, undefined);
});

test("the route context has no hard-coded slot table; plots come from the database", () => {
  assert.equal(context.SLOTS, undefined);
  const ctx = context.createContext({ env: {} });
  assert.equal(ctx.slots, undefined);
});

test("planProperty builds a frozen house on a plot, with plotId equal to slotId", () => {
  const plot = Object.freeze({ id: "slot-03", district: "merchant-quarter", template: "merchant_house" });
  const property = planProperty({ userId: "usr_1", merchantId: "mer_1", allocation: ALLOCATION.merchant, plot });
  assert.ok(Object.isFrozen(property));
  assert.equal(property.slotId, "slot-03");
  assert.equal(property.plotId, "slot-03");
  assert.equal(property.address, "merchant-quarter/slot-03");
  assert.equal(property.merchantId, "mer_1");
  assert.equal(property.ownerId, "usr_1");
  assert.equal(property.published, false);
  assert.equal(property.agent.propertyId, property.id);
});

test("no dead in-memory properties list: houses are read from the database only", async () => {
  const ctx = context.createContext({ env: {} });
  assert.equal("properties" in ctx.db, false);
  const { readFileSync } = await import("node:fs");
  const boot = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(boot, /db\.properties/);
});
