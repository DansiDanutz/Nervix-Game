import test from "node:test";
import assert from "node:assert/strict";
import { registeredCheckout } from "../src/link-registry.mjs";
const order = { id: "ord_example_1", totalMinor: 450 };
const id = "a379a261-b2d5-4c86-8a97-4d838da09403";
const payments = { createCheckout: async () => ({ checkoutId: id, url: "https://example.invalid" }) };
test("live checkout returns the same link persisted with the order and expected amount", async () => {
  const rows = [];
  const result = await registeredCheckout(order, payments, { query: async (_, params) => rows.push(params) });
  assert.deepEqual(rows, [[id, order.id, 450]]);
  assert.equal(result.order.paymentLinkId, result.checkout.checkoutId);
});
test("registration failures never return a usable checkout", async () => {
  await assert.rejects(registeredCheckout(order, {createCheckout: assert.fail}, null), /WORLD_REGISTRY_URL/);
  await assert.rejects(registeredCheckout(order, payments, {query: async () => { throw Error("registry offline"); }}), /registry offline/);
});
