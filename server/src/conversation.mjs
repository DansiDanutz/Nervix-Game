/**
 * Merchant AI employee conversation and tool execution.
 *
 * The model only produces language. Every consequential action is authorized by
 * the merchant config, built by the server as a stored proposal, executed
 * server-side, and gated on explicit confirmation of that proposal's id.
 * The client never supplies the arguments of a confirmed action, and the model
 * never decides whether a payment succeeded.
 */

import { randomUUID } from "node:crypto";
import { TOOLS, authorize, requiresConfirmation } from "./agent.mjs";
import { createOrder, priceLines, applyPaymentEvent } from "./ledger.mjs";
import { createCheckout } from "./nervixpay.demo.mjs";

/** Turns kept per conversation; older turns are dropped. */
export const HISTORY_MAX = 50;
/** Support requests a visitor may file in one conversation. */
export const SUPPORT_MAX = 20;
/** Open proposals per conversation; older ones expire. */
export const PROPOSALS_MAX = 10;
const SUPPORT_MESSAGE_MAX = 2000;
const FULFILMENTS = Object.freeze(["pickup", "delivery", "digital"]);

/** A tool failure with a fixed public `code`; `message` is server-side detail. */
export class ToolError extends Error {
  constructor(message, code = "tool_error") {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export function newState() {
  return { history: [], support: [], proposals: [] };
}

/** A stored conversation, trimmed to the limits. Proposals are never restored from storage. */
export function normalizeState(stored) {
  return {
    history: (Array.isArray(stored?.history) ? stored.history : []).slice(-HISTORY_MAX),
    support: (Array.isArray(stored?.support) ? stored.support : []).slice(-SUPPORT_MAX),
    proposals: [],
  };
}

function searchCatalog(catalog, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalog;
  return catalog.filter((p) => words.some((w) => p.name.toLowerCase().includes(w) || p.sku.includes(w)));
}

/**
 * Price a cart from the catalogue with the S2 ledger rules (`priceLines`): only
 * sku and quantity are read; unknown or inactive skus and quantities above
 * MAX_LINE_QUANTITY are rejected.
 */
function priceCart(catalog, requested) {
  const wanted = (Array.isArray(requested) ? requested : []).map((item) => ({ sku: item?.sku, quantity: item?.quantity ?? 1 }));
  let priced;
  try {
    priced = priceLines(catalog, wanted);
  } catch (error) {
    throw new ToolError(error.message, "invalid_cart");
  }
  const lines = priced.items.map((l) => ({ ...l, lineTotalMinor: l.unitAmountMinor * l.quantity, currency: priced.currency }));
  return { lines, totalMinor: lines.reduce((s, l) => s + l.lineTotalMinor, 0), currency: priced.currency };
}

const requestedLines = (args) => args?.cart?.lines ?? args?.items;

function requireMerchantAvailable(merchant) {
  if (!merchant?.id || !merchant.verified || merchant.suspended) {
    throw new ToolError("merchant is missing, unverified or suspended", "merchant_unavailable");
  }
}

function requireSupportRoom(state) {
  if (state.support.length >= SUPPORT_MAX) throw new ToolError("support request limit reached", "support_limit");
}

const orderId = () => `ord_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

function checkout(args, ctx) {
  const cart = priceCart(ctx.catalog, requestedLines(args));
  requireMerchantAvailable(ctx.merchant);
  const order = createOrder({
    id: orderId(),
    buyerId: ctx.userId,
    merchantId: ctx.merchant.id,
    items: cart.lines.map(({ sku, name, unitAmountMinor, quantity }) => ({ sku, name, unitAmountMinor, quantity })),
    currency: cart.currency,
    fulfillment: FULFILMENTS.includes(args?.fulfillment) ? args.fulfillment : "pickup",
    terms: "demo",
  });
  ctx.orders.set(order.id, order);
  return { order: { id: order.id, totalMinor: order.totalMinor, currency: order.currency, state: order.state }, checkout: createCheckout(order) };
}

/**
 * Execute an authorized tool. Amounts are always recomputed from the catalog —
 * never taken from the player or the model.
 */
export function runTool(tool, args, ctx) {
  if (!authorize(tool, ctx.config)) throw new ToolError(`tool ${tool} is not authorized`, "tool_not_authorized");

  switch (tool) {
    case TOOLS.SEARCH_CATALOG:
      return { results: searchCatalog(ctx.catalog, args.query ?? "") };

    case TOOLS.READ_PRODUCT: {
      const product = ctx.catalog.find((p) => p.sku === args.sku && p.active !== false);
      if (!product) throw new ToolError("unknown product", "unknown_product");
      return { product };
    }

    case TOOLS.READ_INSTRUCTIONS: {
      const doc = ctx.knowledge.find((k) => k.approved && k.kind === "doc");
      if (!doc) throw new ToolError("no approved instructions", "no_instructions");
      return { instructions: doc.content };
    }

    case TOOLS.READ_ELIGIBLE_ORDER: {
      const order = ctx.orders.get(args.orderId);
      if (!order || order.buyerId !== ctx.userId) throw new ToolError("order not found for this user", "order_not_found");
      return { order: { id: order.id, state: order.state, totalMinor: order.totalMinor, currency: order.currency } };
    }

    case TOOLS.PREPARE_CART:
      return priceCart(ctx.catalog, args.items);

    case TOOLS.CREATE_CHECKOUT:
      return checkout(args, ctx);

    case TOOLS.REQUEST_SUPPORT: {
      requireSupportRoom(ctx.state);
      const record = { id: `sup_${ctx.state.support.length + 1}`, userId: ctx.userId, message: String(args.message ?? "").slice(0, SUPPORT_MESSAGE_MAX) };
      ctx.state.support.push(record);
      return { support: record };
    }

    default:
      throw new ToolError(`tool ${tool} is not implemented`, "tool_not_implemented");
  }
}

/** The arguments the server itself builds for a confirming tool. Client args are only a request. */
function proposalArgs(tool, args, message, ctx) {
  if (tool === TOOLS.CREATE_CHECKOUT) {
    const cart = priceCart(ctx.catalog, requestedLines(args));
    requireMerchantAvailable(ctx.merchant);
    return { cart, fulfillment: FULFILMENTS.includes(args?.fulfillment) ? args.fulfillment : "pickup" };
  }
  if (tool === TOOLS.REQUEST_SUPPORT) {
    requireSupportRoom(ctx.state);
    return { message: String(args?.message ?? message).slice(0, SUPPORT_MESSAGE_MAX) };
  }
  throw new ToolError(`tool ${tool} cannot be proposed`, "tool_not_implemented");
}

function propose(state, tool, args, message, ctx) {
  const proposal = { id: `prp_${randomUUID()}`, tool, args: proposalArgs(tool, args, message, ctx) };
  state.proposals = [...state.proposals, proposal].slice(-PROPOSALS_MAX);
  return { proposalId: proposal.id, tool, args: proposal.args, confirmationRequired: true, acknowledged: false };
}

function remember(state, turn) {
  state.history = [...state.history, turn].slice(-HISTORY_MAX);
}

/** Public entry point: returns the reply, citations and any server-built proposals. */
export async function say({ state, message, tool, args = {}, ctx, provider }) {
  const context = ctx.context;
  const reply = await provider.complete({ system: `You are ${ctx.config.name}, ${ctx.config.tone} merchant assistant.`, context, message });
  remember(state, { role: "player", content: message });

  const actions = [];
  if (tool) {
    if (!authorize(tool, ctx.config)) {
      return { text: "That action is not available from this assistant.", citations: [], actions: [], denied: tool, history: state.history };
    }
    actions.push(requiresConfirmation(tool)
      ? propose(state, tool, args, message, ctx)
      : { tool, confirmationRequired: false, acknowledged: false });
  }

  const text = reply
    ?? (tool ? "I can help with that." : "I don't have that information. I can take a support request for the merchant.");

  return { text, citations: context.citations, actions, history: state.history };
}

/** Confirmation is the only path that executes a confirming tool. */
export function confirmAndRun({ action, ctx }) {
  if (!action?.confirmationRequired) throw new ToolError("action does not require confirmation", "confirmation_not_required");
  if (!action.acknowledged) throw new ToolError("action is not acknowledged", "not_acknowledged");
  return runTool(action.tool, action.args ?? {}, ctx);
}

/**
 * Run a proposal the server stored in this conversation, at most once.
 * The tool re-prices and re-authorizes at run time.
 */
export function confirmProposal({ state, proposalId, ctx }) {
  if (typeof proposalId !== "string" || !proposalId) throw new ToolError("a proposal id is required", "proposal_required");
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new ToolError("no such proposal in this conversation", "proposal_not_found");
  state.proposals = state.proposals.filter((p) => p.id !== proposalId);
  return confirmAndRun({ action: { tool: proposal.tool, args: proposal.args, confirmationRequired: true, acknowledged: true }, ctx });
}

export function isConfirmationRequired(tool) {
  return requiresConfirmation(tool);
}

export { applyPaymentEvent };
