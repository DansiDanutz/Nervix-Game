import test from "node:test";
import assert from "node:assert/strict";

import { localProvider, remoteProvider, createProvider } from "../src/provider.mjs";
import { buildContext, TOOLS } from "../src/agent.mjs";
import { newState, runTool, say, confirmAndRun, ToolError } from "../src/conversation.mjs";

const config = {
  name: "Mira", tone: "warm", languages: ["en", "ro"],
  allowed_actions: [TOOLS.SEARCH_CATALOG, TOOLS.READ_PRODUCT, TOOLS.READ_INSTRUCTIONS, TOOLS.READ_ELIGIBLE_ORDER, TOOLS.PREPARE_CART, TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT],
};
const knowledge = [
  { id: "k1", kind: "faq", content: "We open at 08:00 and close at 20:00.", approved: true },
  { id: "k2", kind: "doc", content: "Bring the booking reference.", approved: true },
  { id: "k3", kind: "doc", content: "Internal margins.", approved: false },
];
const catalog = [
  { sku: "coffee", name: "Coffee", unitAmountMinor: 450, currency: "EUR", fulfillment: "pickup", active: true },
  { sku: "pastry", name: "Pastry", unitAmountMinor: 300, currency: "EUR", fulfillment: "pickup", active: true },
];

function makeCtx(overrides = {}) {
  const orders = overrides.orders ?? new Map();
  const state = newState();
  return {
    config, knowledge, catalog, orders, state,
    userId: "u1", merchantId: "mer_1",
    context: buildContext({ config, knowledge, catalog }),
    ...overrides,
  };
}

test("local provider answers from approved knowledge", () => {
  const ctx = makeCtx();
  const reply = localProvider.complete({ context: ctx.context, message: "what time do you open?" });
  assert.match(reply, /08:00/);
});

test("local provider returns null instead of inventing an answer", () => {
  const ctx = makeCtx();
  assert.equal(localProvider.complete({ context: ctx.context, message: "do you sell submarines?" }), null);
});

test("remote provider refuses to run without credentials", () => {
  assert.throws(() => remoteProvider({ baseUrl: "", apiKey: "" }), /baseUrl/);
  assert.equal(createProvider({}).name, "local");
});

test("say() grounds the reply and cites only approved knowledge", async () => {
  const ctx = makeCtx();
  const out = await say({ state: ctx.state, message: "opening hours?", ctx, provider: localProvider });
  assert.match(out.text, /08:00/);
  assert.equal(out.citations.length, 2);
  assert.ok(!out.citations.some((c) => c.id === "k3"));
});

test("an unauthorized tool is denied and not executed", async () => {
  const ctx = makeCtx({ config: { ...config, allowed_actions: [TOOLS.SEARCH_CATALOG] } });
  ctx.context = buildContext({ config: ctx.config, knowledge, catalog });
  const out = await say({ state: ctx.state, message: "buy", tool: TOOLS.CREATE_CHECKOUT, ctx, provider: localProvider });
  assert.equal(out.denied, TOOLS.CREATE_CHECKOUT);
  assert.equal(out.actions.length, 0);
});

test("cart totals are recomputed from the catalog, never trusted from the client", () => {
  const ctx = makeCtx();
  const cart = runTool(TOOLS.PREPARE_CART, { items: [{ sku: "coffee", quantity: 2, unitAmountMinor: 1 }] }, ctx);
  assert.equal(cart.totalMinor, 900);
  assert.equal(cart.lines[0].unitAmountMinor, 450);
});

test("checkout is created only after explicit confirmation", async () => {
  const ctx = makeCtx();
  const cart = runTool(TOOLS.PREPARE_CART, { items: [{ sku: "coffee", quantity: 1 }] }, ctx);
  const out = await say({ state: ctx.state, message: "buy the coffee", tool: TOOLS.CREATE_CHECKOUT, args: { cart }, ctx, provider: localProvider });
  assert.equal(out.actions[0].confirmationRequired, true);
  assert.equal(ctx.orders.size, 0, "no order before confirmation");

  assert.throws(() => confirmAndRun({ action: out.actions[0], ctx }), /acknowledged/);

  const result = confirmAndRun({ action: { ...out.actions[0], acknowledged: true }, ctx });
  assert.equal(result.order.totalMinor, 450);
  assert.equal(ctx.orders.size, 1);
});

test("a player cannot read another user's order", () => {
  const ctx = makeCtx();
  runTool(TOOLS.CREATE_CHECKOUT, { cart: { lines: [{ sku: "coffee", name: "Coffee", unitAmountMinor: 450, quantity: 1, currency: "EUR" }], totalMinor: 450, currency: "EUR" } }, ctx);
  const other = makeCtx({ orders: ctx.orders, userId: "intruder" });
  assert.throws(() => runTool(TOOLS.READ_ELIGIBLE_ORDER, { orderId: "ord_1" }, other), ToolError);
});

test("unknown product and empty cart are refused", () => {
  const ctx = makeCtx();
  assert.throws(() => runTool(TOOLS.PREPARE_CART, { items: [{ sku: "ghost" }] }, ctx), ToolError);
  assert.throws(() => runTool(TOOLS.PREPARE_CART, { items: [] }, ctx), ToolError);
});

test("support requests are recorded only after confirmation", async () => {
  const ctx = makeCtx();
  const out = await say({ state: ctx.state, message: "help", tool: TOOLS.REQUEST_SUPPORT, args: { message: "broken cup" }, ctx, provider: localProvider });
  assert.equal(ctx.state.support.length, 0);
  const result = confirmAndRun({ action: { ...out.actions[0], acknowledged: true }, ctx });
  assert.equal(result.support.message, "broken cup");
  assert.equal(ctx.state.support.length, 1);
});