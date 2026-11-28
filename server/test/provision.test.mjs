import test from "node:test";
import assert from "node:assert/strict";

import { provisionProperty, planProperty, allocationFor, ALLOCATION, ProvisioningError } from "../src/provision.mjs";

const slots = [
  { id: "slot-01", template: "merchant_house", district: "merchant-quarter" },
  { id: "slot-02", template: "merchant_house", district: "merchant-quarter" },
  { id: "slot-03", template: "cafe_shop", district: "coffee-courtyard" },
];

test("merchant gets exactly one property and an agent", () => {
  const { property, created } = provisionProperty({ userId: "usr_1", businessType: "merchant", slots });
  assert.equal(created, true);
  assert.equal(property.template, "merchant_house");
  assert.ok(property.agent);
  assert.equal(property.address, "merchant-quarter/slot-01");
});

test("retry is idempotent: no duplicate property", () => {
  const first = provisionProperty({ userId: "usr_1", businessType: "merchant", slots });
  const all = [first.property];
  const second = provisionProperty({ userId: "usr_1", businessType: "merchant", slots, existing: all });
  assert.equal(second.created, false);
  assert.equal(second.property.id, first.property.id);
  assert.equal(all.length, 1);
});

test("different users get different slots", () => {
  const a = provisionProperty({ userId: "usr_a", businessType: "merchant", slots }).property;
  const b = provisionProperty({ userId: "usr_b", businessType: "merchant", slots, existing: [a] }).property;
  assert.notEqual(a.slotId, b.slotId);
  assert.equal(b.slotId, "slot-02");
});

test("cafe prefers a cafe template", () => {
  const { property } = provisionProperty({ userId: "usr_c", businessType: "cafe", slots });
  assert.equal(property.template, "cafe_shop");
});

test("ordinary user gets no property", () => {
  const { property, created } = provisionProperty({ userId: "usr_u", businessType: "user", slots });
  assert.equal(property, null);
  assert.equal(created, false);
});

test("exhausted slots raise instead of overbooking", () => {
  const full = [
    { id: "s1", template: "merchant_house", district: "d" },
    { id: "s2", template: "merchant_house", district: "d" },
  ];
  const a = provisionProperty({ userId: "u1", businessType: "merchant", slots: full }).property;
  const b = provisionProperty({ userId: "u2", businessType: "merchant", slots: full, existing: [a] }).property;
  assert.throws(
    () => provisionProperty({ userId: "u3", businessType: "merchant", slots: full, existing: [a, b] }),
    ProvisioningError,
  );
});
const PLOT = Object.freeze({ id: "cafe-2", district: "coffee-courtyard", template: "cafe_shop" });

test("planProperty: plotId equals slotId, the house starts unpublished, the agent is tied to it", () => {
  const a = planProperty({ userId: "usr_p", merchantId: "mer_p", allocation: ALLOCATION.cafe, plot: PLOT });
  assert.equal(a.plotId, "cafe-2");
  assert.equal(a.slotId, a.plotId);
  assert.equal(a.published, false);
  assert.equal(a.district, "coffee-courtyard");
  assert.equal(a.template, "cafe_shop");
  assert.match(a.agent.id, /^agent_[0-9a-f]{12}$/);
  assert.equal(a.agent.ownerId, "usr_p");
  assert.equal(a.agent.propertyId, a.id);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.agent));
});

test("planProperty ids are stable per user and differ between users", () => {
  const plan = (userId) => planProperty({ userId, allocation: ALLOCATION.merchant, plot: PLOT });
  assert.equal(plan("usr_x").id, plan("usr_x").id);
  assert.equal(plan("usr_x").agent.id, plan("usr_x").agent.id);
  assert.notEqual(plan("usr_x").id, plan("usr_y").id);
  assert.equal(plan("usr_x").merchantId, null);
});

test("planProperty gives no agent when the allocation has none", () => {
  const plain = planProperty({ userId: "usr_n", allocation: { property: "merchant_house", agent: false }, plot: PLOT });
  assert.equal(plain.agent, null);
});

test("allocationFor returns the allocation for a known type and throws for an unknown one", () => {
  assert.equal(allocationFor("gaming"), ALLOCATION.gaming);
  assert.equal(allocationFor("user").property, null);
  assert.throws(() => allocationFor("nope"), ProvisioningError);
  assert.throws(() => allocationFor(undefined), /unknown businessType/);
});
