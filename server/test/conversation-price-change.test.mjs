/**
 * P5 repair: a confirmed proposal is charged exactly what the visitor was
 * shown. If the catalogue price or currency changed between propose and
 * confirm, the confirm is rejected with `price_changed` and no order is made.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localProvider } from "../src/provider.mjs";
import { buildContext, TOOLS } from "../src/agent.mjs";
import { newState, say, confirmProposal, ToolError } from "../src/conversation.mjs";
import { publicError } from "../src/routes/agent.mjs";

const config = Object.freeze({ name: "Mira", tone: "warm", languages: ["en"], allowed_actions: [TOOLS.CREATE_CHECKOUT] });
const MERCHANT = Object.freeze({ id: "mer_1", verified: true, suspended: false });
const item = (overrides = {}) => Object.freeze({ sku: "kit", name: "Kit", unitAmountMinor: 3999, currency: "EUR", fulfillment: "digital", active: true, ...overrides });

const makeCtx = (catalog, state = newState(), orders = new Map()) => ({
  config, knowledge: [], catalog, orders, state, userId: "u1", merchantId: "mer_1", merchant: MERCHANT,
  context: buildContext({ config, knowledge: [], catalog }),
});

async function proposeKit(catalog) {
  const ctx = makeCtx(catalog);
  const out = await say({ state: ctx.state, message: "buy", tool: TOOLS.CREATE_CHECKOUT, args: { items: [{ sku: "kit", quantity: 2 }] }, ctx, provider: localProvider });
  return { ctx, proposalId: out.actions[0].proposalId };
}

const isPriceChanged = (e) => e.code === "price_changed";

test("a confirm at an unchanged price creates the order at the proposed total", async () => {
  const { ctx, proposalId } = await proposeKit([item()]);
  const result = confirmProposal({ state: ctx.state, proposalId, ctx });
  assert.equal(result.order.totalMinor, 7998);
});

test("a price change between propose and confirm rejects with price_changed and makes no order", async () => {
  const { ctx, proposalId } = await proposeKit([item()]);
  const changed = makeCtx([item({ unitAmountMinor: 4999 })], ctx.state, ctx.orders);
  assert.throws(() => confirmProposal({ state: changed.state, proposalId, ctx: changed }), isPriceChanged);
  assert.equal(ctx.orders.size, 0);
});

test("a cheaper price is also rejected: the visitor is charged only what they were shown", async () => {
  const { ctx, proposalId } = await proposeKit([item()]);
  const changed = makeCtx([item({ unitAmountMinor: 1 })], ctx.state, ctx.orders);
  assert.throws(() => confirmProposal({ state: changed.state, proposalId, ctx: changed }), isPriceChanged);
});

test("a currency change between propose and confirm rejects with price_changed", async () => {
  const { ctx, proposalId } = await proposeKit([item()]);
  const changed = makeCtx([item({ currency: "USD" })], ctx.state, ctx.orders);
  assert.throws(() => confirmProposal({ state: changed.state, proposalId, ctx: changed }), isPriceChanged);
});

test("a rejected proposal is consumed, so the client must ask for a fresh one", async () => {
  const { ctx, proposalId } = await proposeKit([item()]);
  const changed = makeCtx([item({ unitAmountMinor: 4999 })], ctx.state, ctx.orders);
  assert.throws(() => confirmProposal({ state: changed.state, proposalId, ctx: changed }), isPriceChanged);
  assert.throws(() => confirmProposal({ state: ctx.state, proposalId, ctx }), (e) => e.code === "proposal_not_found");
});

test("price_changed has a fixed public message", () => {
  const error = publicError(new ToolError("internal detail", "price_changed"));
  assert.equal(error.name, "price_changed");
  assert.match(error.message, /price/i);
  assert.doesNotMatch(error.message, /internal detail/);
});
