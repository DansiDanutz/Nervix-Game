/**
 * Merchant agent routes: message, confirm and speak (S3).
 *
 * - Every route needs an authenticated caller at BROWSE level or above.
 * - Conversations are private per (property, session user); the user id and
 *   the merchant never come from the request body.
 * - The merchant is the property's own; /message and /confirm both run under
 *   that merchant's agent config, knowledge and catalogue. Without an agent
 *   config the demo default applies, minus checkout.
 * - /confirm runs only a proposal the server built and stored in the caller's
 *   own conversation, by its id. Both routes check the monthly cap and record usage.
 * - The catalogue is the house's visible builder_offerings (P5, D12), never the
 *   legacy `products` table; agent checkouts are priced from it, need a verified
 *   merchant and are saved like S2 orders.
 * - Errors are thrown with fixed public codes, so the dispatcher answers with a
 *   non-200 status and no internal detail.
 * - /speak is captions-only (decision D8: no robotic or system voice).
 */

import { LEVELS, AccessError, requireLevel } from "../entitlement.mjs";
import { TOOLS, buildContext } from "../agent.mjs";
import { checkCap, monthKey } from "../usage.mjs";
import { normalizeState, say, confirmProposal, ToolError } from "../conversation.mjs";
import { caller } from "./guards.mjs";
import { agentCatalogue } from "../house-catalogue.mjs";

const MESSAGE_MAX = 4000;
/** Conversations kept in memory; the least recently used are reloaded from the store. */
export const CONVERSATION_CACHE_MAX = 500;
const CAPTIONS_ONLY = Object.freeze({ available: false, audioUrl: null, captionsOnly: true });
/** Tools the demo default config never grants to a property without its own agent config. */
const MERCHANT_ONLY_TOOLS = Object.freeze([TOOLS.CREATE_CHECKOUT]);

const PUBLIC_MESSAGES = Object.freeze({
  invalid_input: "The message is missing or invalid.",
  tool_not_authorized: "This action is not authorized for this assistant.",
  tool_not_implemented: "This action is not available.",
  invalid_cart: "The cart could not be priced from this merchant's catalogue.",
  price_changed: "A price changed since this was proposed. Ask again for the current price.",
  merchant_unavailable: "This merchant cannot take orders right now.",
  support_limit: "The support request limit for this conversation is reached.",
  proposal_required: "Confirm an action the assistant proposed.",
  proposal_not_found: "That proposal is not open in this conversation.",
  unknown_product: "That product is not in this merchant's catalogue.",
  no_instructions: "This merchant has no approved instructions.",
  order_not_found: "That order was not found for this user.",
});
const GENERIC_CODE = "agent_error";
const GENERIC_MESSAGE = "The assistant could not complete that request.";

export class AgentInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentInputError";
    this.code = "invalid_input";
  }
}

const coded = (code) => {
  const error = new Error(PUBLIC_MESSAGES[code] ?? GENERIC_MESSAGE);
  error.name = PUBLIC_MESSAGES[code] ? code : GENERIC_CODE;
  return error;
};

/** The error the client sees: access errors pass through; others get a fixed code; unknowns are logged. */
export function publicError(error) {
  if (error instanceof AccessError) return error;
  if (error instanceof ToolError || error instanceof AgentInputError) return coded(error.code);
  console.error("[agent] unexpected error:", error);
  return coded(GENERIC_CODE);
}

const conversationKey = (propertyId, userId) => `${propertyId}\u0000${userId}`;

/**
 * One state object per key, loaded once: the pending load promise is cached, so
 * concurrent first requests share it. A bounded LRU; a failed load is not cached.
 */
export async function conversationFor(cache, key, load, max = CONVERSATION_CACHE_MAX) {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const pending = Promise.resolve().then(load).then(normalizeState);
  cache.set(key, pending);
  while (cache.size > max) cache.delete(cache.keys().next().value);
  try {
    return await pending;
  } catch (error) {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  }
}

/** Authenticated, eligible caller and the property they are talking to. Identity is from the session only. */
async function agentCaller(ctx, params) {
  const { user, level } = await caller(ctx, params);
  if (!user) throw new AccessError("sign in to talk to the merchant", "unauthorized");
  requireLevel(level, LEVELS.BROWSE);
  const property = await ctx.db.store.getProperty(params.propertyId);
  if (!property) throw new AccessError("unknown property", "unknown_property");
  return { user, property };
}

/** The merchant's own agent config, or the demo default without merchant-only tools. */
export function agentConfig(defaults, agent) {
  if (!agent) {
    const allowed = (defaults.allowed_actions ?? []).filter((t) => !MERCHANT_ONLY_TOOLS.includes(t));
    return { ...defaults, allowed_actions: allowed };
  }
  return { ...defaults, name: agent.name, tone: agent.tone, languages: agent.languages, allowed_actions: agent.allowed_actions };
}

/** Everything a turn needs, grounded on the property's merchant (never a body merchantId). */
async function merchantTurn(ctx, { user, property }) {
  const { db } = ctx;
  const merchantId = property.merchantId ?? null;
  const [knowledge, agent, house, merchant, state] = await Promise.all([
    merchantId ? db.store.listKnowledge(merchantId, true) : [],
    db.store.getAgent(property.id),
    db.store.getHouse(property.id),
    merchantId ? db.store.getMerchant(merchantId) : null,
    conversationFor(db.conversations, conversationKey(property.id, user.id), () => db.store.getConversation(property.id, user.id)),
  ]);
  const config = agentConfig(db.agent.config, agent);
  const catalog = agentCatalogue(house, user.id);
  const turn = {
    config,
    knowledge,
    catalog,
    context: buildContext({ config, knowledge, catalog }),
    orders: db.orders,
    state,
    userId: user.id,
    merchantId,
    merchant,
  };
  return { agent, turn };
}

/** Checks the merchant's monthly cap; returns a recorder for one request of usage. */
async function requireBudget(db, agent, propertyId) {
  const month = monthKey();
  const usage = await db.store.getUsage(propertyId, month);
  const budget = checkCap({ cap: agent?.monthly_request_cap ?? null, used: usage.requests ?? 0 });
  if (!budget.allowed) throw new AccessError("this merchant's monthly assistant limit is reached", "cap_reached");
  return () => db.store.addUsage(propertyId, month, { requests: 1, tokens: 0 });
}

function readMessage(body) {
  const message = String(body.message ?? "").trim().slice(0, MESSAGE_MAX);
  if (!message) throw new AgentInputError("message is required");
  return message;
}

const readProposalId = (body) => body.proposalId ?? body.action?.proposalId;

/** Agent checkouts are persisted like S2 orders, so /orders/:id/* find them after a restart. */
async function persistOrder(db, result) {
  const order = result?.order && db.orders.get(result.order.id);
  if (order) await db.store.saveOrder(order);
}

const guarded = (handler) => async (body, params) => {
  try {
    return await handler(body, params);
  } catch (error) {
    throw publicError(error);
  }
};

export function createAgentRoutes(ctx) {
  const { db } = ctx;
  return {
    "POST /agent/:propertyId/speak": guarded(async (_body, params) => {
      await agentCaller(ctx, params);
      return CAPTIONS_ONLY;
    }),

    "POST /agent/:propertyId/message": guarded(async (body, params) => {
      const who = await agentCaller(ctx, params);
      const message = readMessage(body);
      const { agent, turn } = await merchantTurn(ctx, who);
      const recordUsage = await requireBudget(db, agent, who.property.id);
      const out = await say({ state: turn.state, message, tool: body.tool, args: body.args ?? {}, ctx: turn, provider: db.provider });
      await db.store.saveConversation(who.property.id, who.user.id, turn.state);
      await recordUsage();
      return out;
    }),

    "POST /agent/:propertyId/confirm": guarded(async (body, params) => {
      const who = await agentCaller(ctx, params);
      const { agent, turn } = await merchantTurn(ctx, who);
      const recordUsage = await requireBudget(db, agent, who.property.id);
      const result = confirmProposal({ state: turn.state, proposalId: readProposalId(body), ctx: turn });
      await persistOrder(db, result);
      await db.store.saveConversation(who.property.id, who.user.id, turn.state);
      await recordUsage();
      return { result };
    }),
  };
}
