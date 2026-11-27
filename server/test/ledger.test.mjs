import test from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_STATES, EVENTS, createOrder, applyPaymentEvent, fulfil, isTerminal, TransitionError,
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
  assert.ok(isTerminal(order.state));
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