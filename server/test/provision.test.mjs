import test from "node:test";
import assert from "node:assert/strict";

import { provisionProperty, ProvisioningError } from "../src/provision.mjs";

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