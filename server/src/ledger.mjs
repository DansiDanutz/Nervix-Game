/**
 * Order and payment state machine.
 *
 * Pure, immutable, no I/O. Money is integer minor units (cents) with an ISO-4217
 * currency code; never a float. A browser redirect or an agent statement is not
 * proof of payment — only a verified provider event moves an order to `paid`.
 *
 * States: created -> pending_payment -> paid -> fulfilled
 *         pending_payment -> failed | cancelled | expired
 *         paid -> fulfilled
 */

export const ORDER_STATES = Object.freeze({
  CREATED: "created",
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  FULFILLED: "fulfilled",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

export const EVENTS = Object.freeze({
  PAYMENT_CREATED: "payment_created",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYMENT_FAILED: "payment_failed",
  PAYMENT_CANCELLED: "payment_cancelled",
  PAYMENT_EXPIRED: "payment_expired",
});

const TRANSITIONS = Object.freeze({
  [ORDER_STATES.CREATED]: [ORDER_STATES.PENDING_PAYMENT, ORDER_STATES.CANCELLED],
  [ORDER_STATES.PENDING_PAYMENT]: [
    ORDER_STATES.PAID,
    ORDER_STATES.FAILED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.EXPIRED,
  ],
  [ORDER_STATES.PAID]: [ORDER_STATES.FULFILLED],
  [ORDER_STATES.FULFILLED]: [],
  [ORDER_STATES.FAILED]: [],
  [ORDER_STATES.CANCELLED]: [],
  [ORDER_STATES.EXPIRED]: [],
});

const EVENT_TO_STATE = Object.freeze({
  [EVENTS.PAYMENT_CREATED]: ORDER_STATES.PENDING_PAYMENT,
  [EVENTS.PAYMENT_PENDING]: ORDER_STATES.PENDING_PAYMENT,
  [EVENTS.PAYMENT_SUCCEEDED]: ORDER_STATES.PAID,
  [EVENTS.PAYMENT_FAILED]: ORDER_STATES.FAILED,
  [EVENTS.PAYMENT_CANCELLED]: ORDER_STATES.CANCELLED,
  [EVENTS.PAYMENT_EXPIRED]: ORDER_STATES.EXPIRED,
});

export class TransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransitionError";
  }
}

export function isMinorUnits(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Create an order from authorized merchant data. The server is authoritative for
 * payee, amount and currency; the client never supplies them.
 */
export function createOrder({ id, buyerId, merchantId, items, currency, fulfillment, terms }) {
  if (!id || !buyerId || !merchantId) throw new TransitionError("id, buyerId and merchantId are required");
  if (!Array.isArray(items) || items.length === 0) throw new TransitionError("items are required");
  if (typeof currency !== "string" || currency.length !== 3) throw new TransitionError("currency must be ISO-4217");

  const lines = items.map((item) => {
    if (!isMinorUnits(item.unitAmountMinor) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new TransitionError("item amounts must be integer minor units and quantity >= 1");
    }
    return { ...item, lineTotalMinor: item.unitAmountMinor * item.quantity };
  });

  return Object.freeze({
    id,
    buyerId,
    merchantId,
    currency,
    fulfillment,
    terms: terms ?? null,
    items: Object.freeze(lines),
    totalMinor: lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    state: ORDER_STATES.CREATED,
    events: Object.freeze([]),
  });
}

function assertTransition(from, to) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new TransitionError(`illegal transition ${from} -> ${to}`);
  }
}

/**
 * Apply one provider event. Event ids are deduplicated: replaying a duplicate
 * notification returns the same order and never fulfils twice.
 */
export function applyPaymentEvent(order, event) {
  const { eventId, type } = event;
  if (!eventId) throw new TransitionError("eventId is required");
  if (order.events.some((e) => e.eventId === eventId)) return order;

  const target = EVENT_TO_STATE[type];
  if (!target) throw new TransitionError(`unknown event type ${type}`);

  // A repeated terminal event for the same order is a no-op, not an error.
  if (order.state === target && target === ORDER_STATES.PENDING_PAYMENT) {
    return withEvent(order, event, ORDER_STATES.PENDING_PAYMENT);
  }

  assertTransition(order.state, target);
  return withEvent(order, event, target);
}

function withEvent(order, event, nextState) {
  return Object.freeze({
    ...order,
    state: nextState,
    events: Object.freeze([...order.events, Object.freeze({ eventId: event.eventId, type: event.type, at: event.at ?? null })]),
  });
}

/** Fulfilment happens only after a verified payment, and only once. */
export function fulfil(order) {
  if (order.state !== ORDER_STATES.PAID) {
    throw new TransitionError(`cannot fulfil an order in state ${order.state}`);
  }
  assertTransition(order.state, ORDER_STATES.FULFILLED);
  return Object.freeze({ ...order, state: ORDER_STATES.FULFILLED });
}

export function isTerminal(state) {
  return TRANSITIONS[state].length === 0;
}