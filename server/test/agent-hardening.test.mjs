/**
 * S3 review fixes, pure layer: server-built proposals, catalogue-priced agent
 * checkout, merchant availability, bounded conversation state, the race-free
 * conversation cache and fixed public error codes.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localProvider } from "../src/provider.mjs";
import { buildContext, TOOLS } from "../src/agent.mjs";
import { MAX_LINE_QUANTITY } from "../src/ledger.mjs";
import {
  newState, normalizeState, runTool, say, confirmProposal, ToolError,
  HISTORY_MAX, SUPPORT_MAX, PROPOSALS_MAX,
} from "../src/conversation.mjs";
import { agentConfig, conversationFor, publicError, CONVERSATION_CACHE_MAX } from "../src/routes/agent.mjs";
import { AccessError } from "../src/entitlement.mjs";

const config = {
  name: "Mira", tone: "warm", languages: ["en"],
  allowed_actions: [TOOLS.SEARCH_CATALOG, TOOLS.PREPARE_CART, TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT],
};
const catalog = [
  { sku: "coffee", name: "Coffee", unitAmountMinor: 450, currency: "EUR", fulfillment: "pickup", active: true },
  { sku: "retired", name: "Retired", unitAmountMinor: 5, currency: "EUR", fulfillment: "pickup", active: false },
];
const VERIFIED = Object.freeze({ id: "mer_1", verified: true, suspended: false });

function makeCtx(overrides = {}) {
  return {
    config, knowledge: [], catalog, orders: new Map(), state: newState(),
    userId: "u1", merchantId: "mer_1", merchant: VERIFIED,
    context: buildContext({ config, knowledge: [], catalog }),
    ...overrides,
  };
}

const tampered = { cart: { lines: [{ sku: "coffee", name: "Free", unitAmountMinor: 1, quantity: 2, lineTotalMinor: 2, currency: "USD" }], totalMinor: 2, currency: "USD" } };

test("create_checkout rebuilds a tampered cart from the catalogue", () => {
  const ctx = makeCtx();
  const out = runTool(TOOLS.CREATE_CHECKOUT, tampered, ctx);
  assert.equal(out.order.totalMinor, 900);
  assert.equal(out.order.currency, "EUR");
  const stored = ctx.orders.get(out.order.id);
  assert.equal(stored.items[0].unitAmountMinor, 450);
  assert.equal(stored.items[0].name, "Coffee");
  assert.equal(stored.merchantId, "mer_1");
});

test("create_checkout rejects unknown, inactive and over-limit lines", () => {
  const ctx = makeCtx();
  const lines = (l) => ({ cart: { lines: [l] } });
  assert.throws(() => runTool(TOOLS.CREATE_CHECKOUT, lines({ sku: "ghost", quantity: 1 }), ctx), (e) => e instanceof ToolError && e.code === "invalid_cart");
  assert.throws(() => runTool(TOOLS.CREATE_CHECKOUT, lines({ sku: "retired", quantity: 1 }), ctx), (e) => e.code === "invalid_cart");
  assert.throws(() => runTool(TOOLS.CREATE_CHECKOUT, lines({ sku: "coffee", quantity: MAX_LINE_QUANTITY + 1 }), ctx), (e) => e.code === "invalid_cart");
  assert.throws(() => runTool(TOOLS.CREATE_CHECKOUT, { cart: { lines: [] } }, ctx), (e) => e.code === "invalid_cart");
  assert.equal(ctx.orders.size, 0);
});

test("create_checkout refuses an unverified, suspended or missing merchant", () => {
  for (const merchant of [{ ...VERIFIED, verified: false }, { ...VERIFIED, suspended: true }, null]) {
    const ctx = makeCtx({ merchant });
    assert.throws(() => runTool(TOOLS.CREATE_CHECKOUT, tampered, ctx), (e) => e.code === "merchant_unavailable");
    assert.equal(ctx.orders.size, 0);
  }
});

test("prepare_cart enforces the same quantity limit", () => {
  assert.throws(() => runTool(TOOLS.PREPARE_CART, { items: [{ sku: "coffee", quantity: MAX_LINE_QUANTITY + 1 }] }, makeCtx()), ToolError);
  assert.equal(runTool(TOOLS.PREPARE_CART, { items: [{ sku: "coffee" }] }, makeCtx()).totalMinor, 450);
});

test("say() stores a server-built proposal and never echoes client args", async () => {
  const ctx = makeCtx();
  const out = await say({ state: ctx.state, message: "buy two", tool: TOOLS.CREATE_CHECKOUT, args: { ...tampered, evil: true }, ctx, provider: localProvider });
  const [action] = out.actions;
  assert.match(action.proposalId, /^prp_/);
  assert.equal(action.args.cart.totalMinor, 900);
  assert.equal(action.args.cart.lines[0].unitAmountMinor, 450);
  assert.equal(action.args.evil, undefined);
  assert.equal(ctx.state.proposals.length, 1);
  assert.equal(ctx.orders.size, 0, "no order before confirmation");
});

test("say() lists a non-confirming tool without client args or a proposal", async () => {
  const ctx = makeCtx();
  const out = await say({ state: ctx.state, message: "find coffee", tool: TOOLS.SEARCH_CATALOG, args: { query: "x", injected: 1 }, ctx, provider: localProvider });
  assert.deepEqual(out.actions, [{ tool: TOOLS.SEARCH_CATALOG, confirmationRequired: false, acknowledged: false }]);
  assert.equal(ctx.state.proposals.length, 0);
});

test("confirmProposal runs only a stored proposal, once", async () => {
  const ctx = makeCtx();
  const out = await say({ state: ctx.state, message: "buy", tool: TOOLS.CREATE_CHECKOUT, args: tampered, ctx, provider: localProvider });
  const id = out.actions[0].proposalId;
  assert.throws(() => confirmProposal({ state: ctx.state, proposalId: "prp_forged", ctx }), (e) => e.code === "proposal_not_found");
  assert.throws(() => confirmProposal({ state: ctx.state, proposalId: undefined, ctx }), (e) => e.code === "proposal_required");
  const result = confirmProposal({ state: ctx.state, proposalId: id, ctx });
  assert.equal(result.order.totalMinor, 900);
  assert.throws(() => confirmProposal({ state: ctx.state, proposalId: id, ctx }), (e) => e.code === "proposal_not_found");
  assert.equal(ctx.orders.size, 1);
});

test("another user's state cannot confirm a proposal", async () => {
  const a = makeCtx();
  const out = await say({ state: a.state, message: "buy", tool: TOOLS.CREATE_CHECKOUT, args: tampered, ctx: a, provider: localProvider });
  const b = makeCtx({ userId: "u2", orders: a.orders });
  assert.throws(() => confirmProposal({ state: b.state, proposalId: out.actions[0].proposalId, ctx: b }), (e) => e.code === "proposal_not_found");
});

test("history, support and proposals are bounded", async () => {
  const ctx = makeCtx();
  for (let i = 0; i < HISTORY_MAX + 5; i++) {
    await say({ state: ctx.state, message: `m${i}`, ctx, provider: localProvider });
  }
  assert.equal(ctx.state.history.length, HISTORY_MAX);
  assert.equal(ctx.state.history.at(-1).content, `m${HISTORY_MAX + 4}`);

  for (let i = 0; i < PROPOSALS_MAX + 3; i++) {
    await say({ state: ctx.state, message: "help", tool: TOOLS.REQUEST_SUPPORT, args: { message: "x" }, ctx, provider: localProvider });
  }
  assert.equal(ctx.state.proposals.length, PROPOSALS_MAX);

  for (let i = 0; i < SUPPORT_MAX; i++) runTool(TOOLS.REQUEST_SUPPORT, { message: `s${i}` }, ctx);
  assert.equal(ctx.state.support.length, SUPPORT_MAX);
  assert.throws(() => runTool(TOOLS.REQUEST_SUPPORT, { message: "flood" }, ctx), (e) => e.code === "support_limit");
  await assert.rejects(
    say({ state: ctx.state, message: "help", tool: TOOLS.REQUEST_SUPPORT, args: {}, ctx, provider: localProvider }),
    (e) => e.code === "support_limit",
  );
});

test("normalizeState trims stored state and drops stored proposals", () => {
  const long = Array.from({ length: HISTORY_MAX + 10 }, (_, i) => ({ role: "player", content: String(i) }));
  const state = normalizeState({ history: long, support: null, proposals: [{ id: "prp_old" }] });
  assert.equal(state.history.length, HISTORY_MAX);
  assert.deepEqual(state.support, []);
  assert.deepEqual(state.proposals, []);
});

test("the demo default config never grants create_checkout", () => {
  const defaults = { name: "Mira", tone: "warm", allowed_actions: [TOOLS.SEARCH_CATALOG, TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT] };
  assert.ok(!agentConfig(defaults, null).allowed_actions.includes(TOOLS.CREATE_CHECKOUT));
  assert.ok(agentConfig(defaults, null).allowed_actions.includes(TOOLS.REQUEST_SUPPORT));
  const own = { name: "Ava", tone: "calm", languages: ["en"], allowed_actions: [TOOLS.CREATE_CHECKOUT] };
  assert.deepEqual(agentConfig(defaults, own).allowed_actions, [TOOLS.CREATE_CHECKOUT]);
});

test("concurrent first loads share one state object", async () => {
  const cache = new Map();
  let loads = 0;
  const load = () => new Promise((resolve) => { loads++; setTimeout(() => resolve({ history: [], support: [] }), 10); });
  const [s1, s2] = await Promise.all([conversationFor(cache, "k", load), conversationFor(cache, "k", load)]);
  assert.equal(s1, s2);
  assert.equal(loads, 1);
});

test("a failed load is not cached", async () => {
  const cache = new Map();
  await assert.rejects(conversationFor(cache, "k", () => Promise.reject(new Error("db down"))));
  assert.equal(cache.size, 0);
  const state = await conversationFor(cache, "k", async () => null);
  assert.deepEqual(state.history, []);
});

test("the conversation cache is a bounded LRU", async () => {
  const cache = new Map();
  const load = async () => null;
  for (let i = 0; i < CONVERSATION_CACHE_MAX + 5; i++) await conversationFor(cache, `k${i}`, load);
  assert.equal(cache.size, CONVERSATION_CACHE_MAX);
  assert.ok(!cache.has("k0"));
  await conversationFor(cache, "k5", load); // touch: k5 becomes most recent
  await conversationFor(cache, "new", load);
  assert.ok(cache.has("k5"));
  assert.ok(!cache.has("k6"));
});

test("publicError maps tool and input errors to fixed codes and hides internals", () => {
  const tool = publicError(new ToolError("tool read_eligible_order is not authorized", "tool_not_authorized"));
  assert.equal(tool.name, "tool_not_authorized");
  assert.ok(!tool.message.includes("read_eligible_order"));

  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const unexpected = publicError(new Error('relation "orders" violates constraint xyz'));
    assert.equal(unexpected.name, "agent_error");
    assert.ok(!unexpected.message.includes("orders"));
    assert.equal(logged.length, 1, "the detail is logged on the server");
  } finally {
    console.error = original;
  }

  const access = new AccessError("nope", "unauthorized");
  assert.equal(publicError(access), access, "access errors pass through to the dispatcher");
});
