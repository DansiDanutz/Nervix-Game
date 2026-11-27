/**
 * Merchant AI employee conversation and tool execution.
 *
 * The model only produces language. Every consequential action is authorized by
 * the merchant config, executed server-side, and gated on explicit confirmation.
 * The model never decides whether a payment succeeded.
 */

import { TOOLS, authorize, requiresConfirmation } from "./agent.mjs";
import { createOrder, applyPaymentEvent } from "./ledger.mjs";
import { createCheckout } from "./nervixpay.demo.mjs";

export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolError";
  }
}

export function newState() {
  return { history: [], support: [] };
}

function searchCatalog(catalog, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalog;
  return catalog.filter((p) => words.some((w) => p.name.toLowerCase().includes(w) || p.sku.includes(w)));
}

/**
 * Execute an authorized tool. Amounts are always recomputed from the catalog —
 * never taken from the player or the model.
 */
export function runTool(tool, args, ctx) {
  if (!authorize(tool, ctx.config)) throw new ToolError(`tool ${tool} is not authorized`);

  switch (tool) {
    case TOOLS.SEARCH_CATALOG:
      return { results: searchCatalog(ctx.catalog, args.query ?? "") };

    case TOOLS.READ_PRODUCT: {
      const product = ctx.catalog.find((p) => p.sku === args.sku && p.active !== false);
      if (!product) throw new ToolError("unknown product");
      return { product };
    }

    case TOOLS.READ_INSTRUCTIONS: {
      const doc = ctx.knowledge.find((k) => k.approved && k.kind === "doc");
      if (!doc) throw new ToolError("no approved instructions");
      return { instructions: doc.content };
    }

    case TOOLS.READ_ELIGIBLE_ORDER: {
      const order = ctx.orders.get(args.orderId);
      if (!order || order.buyerId !== ctx.userId) throw new ToolError("order not found for this user");
      return { order: { id: order.id, state: order.state, totalMinor: order.totalMinor, currency: order.currency } };
    }

    case TOOLS.PREPARE_CART: {
      const lines = (args.items ?? []).map((item) => {
        const product = ctx.catalog.find((p) => p.sku === item.sku && p.active !== false);
        if (!product) throw new ToolError(`unknown product ${item.sku}`);
        const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        return { sku: product.sku, name: product.name, unitAmountMinor: product.unitAmountMinor, quantity, lineTotalMinor: product.unitAmountMinor * quantity, currency: product.currency };
      });
      if (lines.length === 0) throw new ToolError("cart is empty");
      return { lines, totalMinor: lines.reduce((s, l) => s + l.lineTotalMinor, 0), currency: lines[0].currency };
    }

    case TOOLS.CREATE_CHECKOUT: {
      const cart = args.cart;
      if (!cart?.lines?.length) throw new ToolError("cart is required");
      const order = createOrder({
        id: `ord_${ctx.orders.size + 1}`,
        buyerId: ctx.userId,
        merchantId: ctx.merchantId,
        items: cart.lines,
        currency: cart.currency,
        fulfillment: args.fulfillment ?? "pickup",
        terms: "demo",
      });
      ctx.orders.set(order.id, order);
      return { order: { id: order.id, totalMinor: order.totalMinor, currency: order.currency, state: order.state }, checkout: createCheckout(order) };
    }

    case TOOLS.REQUEST_SUPPORT: {
      const record = { id: `sup_${ctx.state.support.length + 1}`, userId: ctx.userId, message: String(args.message ?? "").slice(0, 2000) };
      ctx.state.support.push(record);
      return { support: record };
    }

    default:
      throw new ToolError(`tool ${tool} is not implemented`);
  }
}

/** Public entry point: returns the reply, citations and any proposed actions. */
export async function say({ state, message, tool, args = {}, ctx, provider }) {
  const context = ctx.context;
  const reply = await provider.complete({ system: `You are ${ctx.config.name}, ${ctx.config.tone} merchant assistant.`, context, message });
  state.history.push({ role: "player", content: message });

  const actions = [];
  if (tool) {
    if (!authorize(tool, ctx.config)) {
      return { text: "That action is not available from this assistant.", citations: [], actions: [], denied: tool };
    }
    actions.push({ tool, args, confirmationRequired: requiresConfirmation(tool), acknowledged: false });
  }

  const text = reply
    ?? (tool ? "I can help with that." : "I don't have that information. I can take a support request for the merchant.");

  return { text, citations: context.citations, actions, history: state.history };
}

/** Confirmation is the only path that executes a confirming tool. */
export function confirmAndRun({ action, ctx }) {
  if (!action?.confirmationRequired) throw new ToolError("action does not require confirmation");
  if (!action.acknowledged) throw new ToolError("action is not acknowledged");
  return runTool(action.tool, action.args ?? {}, ctx);
}

export function isConfirmationRequired(tool) {
  return requiresConfirmation(tool);
}

export { applyPaymentEvent };