import test from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_STATES, EVENTS, createOrder, applyPaymentEvent, fulfil, refund, isTerminal, TransitionError,
  priceLines, orderRole, MAX_LINE_QUANTITY, orderFulfillment, FULFILLMENT_MODES,
} from "../src/ledger.mjs";

const items = [{ sku: "coffee", name: "Coffee", unitAmountMinor: 450, quantity: 2 }];
const base = { id: "ord_1", buyerId: "usr_1", merchantId: "mer_1", items, currency: "EUR", fulfillment: "pickup" };

test("total is computed in integer minor units", () => {
  const order = createOrder(base);
  assert.equal(order.totalMinor, 900);
  assert.equal(order.state, ORDER_STATES.CREATED);
});

test("rejects float money", () => {
  assert.throws(() => createOrder({ ...base, items: [{ ...items[0], unitAmountMinor: 4.5 }] }), TransitionError);
});

test("happy path: pending -> paid -> fulfilled", () => {
  let order = createOrder(base);
  order = applyPaymentEvent(order, { eventId: "e1", type: EVENTS.PAYMENT_CREATED });
  assert.equal(order.state, ORDER_STATES.PENDING_PAYMENT);
  order = applyPaymentEvent(order, { eventId: "e2", type: EVENTS.PAYMENT_SUCCEEDED });
  assert.equal(order.state, ORDER_STATES.PAID);
  order = fulfil(order);
  assert.equal(order.state, ORDER_STATES.FULFILLED);
  // A fulfilled order may still be refunded, so it is not terminal.
  assert.ok(!isTerminal(order.state));
  assert.ok(isTerminal(refund(order).state));
});

test("duplicate webhook does not fulfil twice", () => {
  let order = createOrder(base);
  order = applyPaymentEvent(order, { eventId: "e1", type: EVENTS.PAYMENT_CREATED });
  order = applyPaymentEvent(order, { eventId: "e2", type: EVENTS.PAYMENT_SUCCEEDED });
  const once = fulfil(order);
  const replay = applyPaymentEvent(once, { eventId: "e2", type: EVENTS.PAYMENT_SUCCEEDED });
  assert.equal(replay, once, "duplicate event returns the same order object");
  assert.equal(replay.events.length, 2);
});

test("cannot fulfil an unpaid order", () => {
  const order = createOrder(base);
  assert.throws(() => fulfil(order), TransitionError);
});

test("cannot pay an expired order", () => {
  let order = createOrder(base);
  order = applyPaymentEvent(order, { eventId: "e1", type: EVENTS.PAYMENT_CREATED });
  order = applyPaymentEvent(order, { eventId: "e2", type: EVENTS.PAYMENT_EXPIRED });
  assert.equal(order.state, ORDER_STATES.EXPIRED);
  assert.throws(() => applyPaymentEvent(order, { eventId: "e3", type: EVENTS.PAYMENT_SUCCEEDED }), TransitionError);
});

test("failed and cancelled are terminal", () => {
  for (const [eventId, type, state] of [
    ["f1", EVENTS.PAYMENT_FAILED, ORDER_STATES.FAILED],
    ["c1", EVENTS.PAYMENT_CANCELLED, ORDER_STATES.CANCELLED],
  ]) {
    let order = createOrder(base);
    order = applyPaymentEvent(order, { eventId: "p", type: EVENTS.PAYMENT_CREATED });
    order = applyPaymentEvent(order, { eventId, type });
    assert.equal(order.state, state);
    assert.ok(isTerminal(order.state));
  }
});

test("unknown event type is rejected", () => {
  const order = createOrder(base);
  assert.throws(() => applyPaymentEvent(order, { eventId: "x", type: "nonsense" }), TransitionError);
});
test("a paid order can be refunded once", () => {
  let order = createOrder(base);
  order = applyPaymentEvent(order, { eventId: "r1", type: EVENTS.PAYMENT_CREATED });
  order = applyPaymentEvent(order, { eventId: "r2", type: EVENTS.PAYMENT_SUCCEEDED });
  const refunded = refund(order, { reason: "changed mind" });
  assert.equal(refunded.state, ORDER_STATES.REFUNDED);
  assert.equal(refunded.refundReason, "changed mind");
  assert.throws(() => refund(refunded), TransitionError);
});

test("a fulfilled order can still be refunded", () => {
  let order = createOrder(base);
  order = applyPaymentEvent(order, { eventId: "f1", type: EVENTS.PAYMENT_CREATED });
  order = applyPaymentEvent(order, { eventId: "f2", type: EVENTS.PAYMENT_SUCCEEDED });
  order = fulfil(order);
  assert.equal(refund(order).state, ORDER_STATES.REFUNDED);
});

test("an unpaid order cannot be refunded", () => {
  assert.throws(() => refund(createOrder(base)), TransitionError);
});

// --- S2: server-side pricing and order roles -------------------------------

const catalogue = Object.freeze([
  { sku: "seat", name: "Seat", unitAmountMinor: 1750, currency: "EUR", active: true },
  { sku: "chip", name: "Chip", unitAmountMinor: 100, currency: "EUR", active: true },
  { sku: "retired", name: "Retired", unitAmountMinor: 5, currency: "EUR", active: false },
  { sku: "usd", name: "Dollar thing", unitAmountMinor: 200, currency: "USD", active: true },
]);

test("priceLines ignores client prices and names and uses the catalogue", () => {
  const priced = priceLines(catalogue, [{ sku: "seat", quantity: 2, unitAmountMinor: 1, name: "Free seat", lineTotalMinor: 2 }]);
  assert.equal(priced.currency, "EUR");
  assert.deepEqual(priced.items, [{ sku: "seat", name: "Seat", unitAmountMinor: 1750, quantity: 2 }]);
  assert.ok(Object.isFrozen(priced) && Object.isFrozen(priced.items));
});

test("priceLines merges duplicate skus", () => {
  const priced = priceLines(catalogue, [{ sku: "chip", quantity: 1 }, { sku: "chip", quantity: 3 }]);
  assert.deepEqual(priced.items, [{ sku: "chip", name: "Chip", unitAmountMinor: 100, quantity: 4 }]);
});

test("priceLines rejects unknown or inactive skus", () => {
  assert.throws(() => priceLines(catalogue, [{ sku: "nope", quantity: 1 }]), TransitionError);
  assert.throws(() => priceLines(catalogue, [{ sku: "retired", quantity: 1 }]), TransitionError);
});

test("priceLines rejects bad quantities and empty requests", () => {
  for (const quantity of [0, -1, 1.5, "2", MAX_LINE_QUANTITY + 1]) {
    assert.throws(() => priceLines(catalogue, [{ sku: "seat", quantity }]), TransitionError, `quantity ${quantity}`);
  }
  assert.throws(() => priceLines(catalogue, []), TransitionError);
  assert.throws(() => priceLines(catalogue, undefined), TransitionError);
  assert.throws(() => priceLines(catalogue, [{ sku: "seat", quantity: MAX_LINE_QUANTITY }, { sku: "seat", quantity: 1 }]), TransitionError);
});

test("priceLines rejects mixed currencies", () => {
  assert.throws(() => priceLines(catalogue, [{ sku: "seat", quantity: 1 }, { sku: "usd", quantity: 1 }]), TransitionError);
});

test("a priced order totals from server prices", () => {
  const priced = priceLines(catalogue, [{ sku: "seat", quantity: 2, unitAmountMinor: 1 }]);
  const order = createOrder({ ...base, items: priced.items, currency: priced.currency });
  assert.equal(order.totalMinor, 3500);
});

test("orderRole names the buyer and the merchant owner, nobody else", () => {
  const order = createOrder(base);
  assert.equal(orderRole(order, { userId: "usr_1", merchantOwnerId: "usr_m" }), "buyer");
  assert.equal(orderRole(order, { userId: "usr_m", merchantOwnerId: "usr_m" }), "merchant");
  assert.equal(orderRole(order, { userId: "usr_x", merchantOwnerId: "usr_m" }), null);
  assert.equal(orderRole(order, { userId: null, merchantOwnerId: null }), null);
  assert.equal(orderRole(order, { userId: undefined, merchantOwnerId: undefined }), null);
});

// --- S2 review: fulfilment comes from the catalogue, never the client ------

const shippable = Object.freeze([
  { sku: "seat", unitAmountMinor: 1750, currency: "EUR", fulfillment: "digital", active: true },
  { sku: "pass", unitAmountMinor: 900, currency: "EUR", fulfillment: "digital", active: true },
  { sku: "mug", unitAmountMinor: 1200, currency: "EUR", fulfillment: "pickup", active: true },
  { sku: "warp", unitAmountMinor: 1, currency: "EUR", fulfillment: "teleport", active: true },
  { sku: "bare", unitAmountMinor: 1, currency: "EUR", active: true },
]);

test("orderFulfillment takes the mode from the catalogue products", () => {
  assert.equal(orderFulfillment(shippable, [{ sku: "seat" }, { sku: "pass" }]), "digital");
  assert.equal(orderFulfillment(shippable, [{ sku: "mug" }]), "pickup");
});

test("orderFulfillment rejects an unknown mode, a missing mode and mixed modes", () => {
  assert.throws(() => orderFulfillment(shippable, [{ sku: "warp" }]), TransitionError);
  assert.throws(() => orderFulfillment(shippable, [{ sku: "bare" }]), TransitionError);
  assert.throws(() => orderFulfillment(shippable, [{ sku: "seat" }, { sku: "mug" }]), TransitionError);
  assert.throws(() => orderFulfillment(shippable, [{ sku: "nope" }]), TransitionError);
});

test("FULFILLMENT_MODES matches the products CHECK constraint", () => {
  assert.deepEqual([...FULFILLMENT_MODES].sort(), ["appointment", "delivery", "digital", "pickup"]);
  assert.ok(Object.isFrozen(FULFILLMENT_MODES));
});
