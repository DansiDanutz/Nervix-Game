/**
 * Merchant AI employee: grounding, tool authorization and confirmation.
 *
 * Pure and I/O-free. The model is replaceable; this module decides what it may
 * see and do. Player messages, uploaded documents and app responses are untrusted
 * data — they never grant permissions or change payment destinations.
 */

export const TOOLS = Object.freeze({
  SEARCH_CATALOG: "search_catalog",
  READ_PRODUCT: "read_product",
  READ_INSTRUCTIONS: "read_instructions",
  READ_ELIGIBLE_ORDER: "read_eligible_order",
  PREPARE_CART: "prepare_cart",
  CREATE_CHECKOUT: "create_checkout",
  OPEN_APP: "open_app",
  REQUEST_SUPPORT: "request_support",
});

/** Actions that change something outside the conversation need confirmation. */
const CONFIRMING = new Set([TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT]);

export class AgentError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentError";
  }
}

export function allowedActions(config) {
  return Array.isArray(config?.allowed_actions) ? config.allowed_actions : [];
}

export function authorize(tool, config) {
  return allowedActions(config).includes(tool);
}

export function requiresConfirmation(tool) {
  return CONFIRMING.has(tool);
}

/**
 * Ground the answer in the merchant's own approved knowledge only.
 * Returns the context plus the citations the runtime must show.
 */
export function buildContext({ config, knowledge = [], catalog = [] }) {
  if (!config || typeof config.name !== "string") throw new AgentError("agent config is required");
  const approved = knowledge.filter((k) => k.approved);
  const active = catalog.filter((p) => p.active !== false);
  return {
    agent: { name: config.name, tone: config.tone, languages: config.languages ?? ["en", "ro"] },
    knowledge: approved.map((k) => ({ id: k.id, text: k.content ?? "" })),
    catalog: active.map((p) => ({ sku: p.sku, name: p.name, unitAmountMinor: p.unitAmountMinor, currency: p.currency, fulfillment: p.fulfillment })),
    citations: approved.map((k) => ({ id: k.id, kind: k.kind, uri: k.uri ?? null })),
  };
}

/** Strip any attempt to smuggle privileged fields through player text. */
export function asUntrustedData(text) {
  return { role: "player", content: String(text ?? "").slice(0, 4000), trusted: false };
}

/**
 * Decide the next step for a player message.
 * The model is never told whether a payment succeeded — only verified events do that.
 */
export function plan({ message, context, config, tool }) {
  if (!tool) {
    return { text: "I can help with the catalog, usage instructions, your order, or a booking.", citations: context.citations, actions: [] };
  }
  if (!authorize(tool, config)) {
    return { text: "That action is not available from this merchant's assistant.", citations: [], actions: [], denied: tool };
  }
  const action = {
    tool,
    confirmationRequired: requiresConfirmation(tool),
    acknowledged: false,
  };
  return {
    text: requiresConfirmation(tool)
      ? "Please confirm before I do that."
      : "Working on it.",
    citations: context.citations,
    actions: [action],
    untrusted: asUntrustedData(message),
  };
}

export function confirm(action) {
  if (!action?.confirmationRequired) return action;
  return { ...action, acknowledged: true };
}