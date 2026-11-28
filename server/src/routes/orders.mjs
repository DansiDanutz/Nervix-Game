/**
 * Catalogue, orders and payment events (S2).
 *
 * - Identity comes from the session only. `buyerId` and `userId` in a request
 *   are ignored.
 * - Line names, prices and currency are recomputed from the server catalogue;
 *   only `sku` and `quantity` are read from the client.
 * - `/orders` never creates merchants: an unknown merchant is rejected.
 * - `/events` and `/refund` need the buyer or the merchant owner; `/fulfil`
 *   needs the merchant owner. All three run in demo mode only. To anyone else
 *   an existing order looks exactly like a missing one.
 * - Fulfilment comes from the catalogue products and terms are set here.
 * - The webhook is the provider's channel and exists only in live mode, where
 *   the adapter verifies the signature. In demo mode (always, in the slice) it
 *   is refused: demo payments go through the authorized `/events` route.
 * - State changes are saved conditionally on the state they were read in.
 * - Live payments exist only when payments-config allows them; the slice and
 *   NODE_ENV=test always stay on the demo adapter.
 */

import { AccessError } from "../entitlement.mjs";
import { registeredCheckout } from "../link-registry.mjs";
import { createOrder, applyPaymentEvent, fulfil, refund, priceLines, orderFulfillment, orderRole, ORDER_STATES, EVENTS } from "../ledger.mjs";
import { createCheckout as demoCheckout, verifyWebhook as demoVerify } from "../nervixpay.demo.mjs";
import { livePaymentsAllowed } from "../payments-config.mjs";
import { resolveUser } from "./guards.mjs";

const NOT_FOUND = Object.freeze({ error: "not_found" });
const INVALID_PAYLOAD = Object.freeze({ error: "invalid_payload" });
const DEMO_WEBHOOK_REFUSED = Object.freeze({ error: "demo_only", message: "the payment webhook is disabled in demo mode" });
const DEMO_TERMS = "demo";

/** A 400 response whose `error` is `code` (the dispatcher reports `error.name`). */
function requestError(code, message) {
  const error = new Error(message);
  error.name = code;
  return error;
}

async function requireUser(ctx, params) {
  const user = await resolveUser(ctx, params);
  if (!user) throw new AccessError("sign in first", "unauthorized");
  return user;
}

/** A real checkout opens a pending payment before the paid event arrives. */
function applyWithOpening(order, event) {
  const opened = order.state === ORDER_STATES.CREATED
    ? applyPaymentEvent(order, { eventId: `${event.eventId}_created`, type: EVENTS.PAYMENT_CREATED })
    : order;
  return applyPaymentEvent(opened, event);
}

const PARTICIPANTS = Object.freeze(["buyer", "merchant"]);
const MERCHANT_ONLY = Object.freeze(["merchant"]);

export function createOrderRoutes(ctx) {
  const { db, registry, env = process.env } = ctx;
  // Fail closed: a live adapter in the context is ignored unless live mode is allowed.
  const payments = livePaymentsAllowed(env) ? db.payments : null;
  let orderSeq = 0;

  async function loadOrder(id) {
    return db.orders.get(id) ?? (db.store ? await db.store.getOrder(id) : null);
  }

  async function merchantOwnerId(merchantId) {
    return db.store ? (await db.store.getMerchant(merchantId))?.ownerId ?? null : null;
  }

  async function roleFor(order, user) {
    return orderRole(order, { userId: user.id, merchantOwnerId: await merchantOwnerId(order.merchantId) });
  }

  /**
   * Loads the order for a participant. A non-participant gets `order: null`,
   * the same as for a missing order, so the routes leak no existence oracle.
   * `roles` limits which participants may act (default: buyer or merchant).
   */
  async function authorizedOrder(ctx, params, roles = PARTICIPANTS) {
    const user = await requireUser(ctx, params);
    const order = await loadOrder(params.id);
    const role = order ? await roleFor(order, user) : null;
    if (!role) return { order: null };
    if (!roles.includes(role)) throw new AccessError("only the merchant owner can do this", "forbidden");
    return { order };
  }

  /** Saves `next` only if the stored order is still in `expectedState` (null for a new order). */
  async function save(next, expectedState = null) {
    try {
      await db.store?.saveOrder(next, { expectedState });
    } catch (error) {
      // The cached copy is stale; drop it so the next read comes from the store.
      db.orders.delete(next.id);
      throw error;
    }
    db.orders.set(next.id, next);
    return { order: next };
  }

  /** Applies `transition` to a loaded order and saves it conditionally. */
  function transitionAndSave(order, transition) {
    return save(transition(order), order.state);
  }

  async function merchantCatalogue(merchantId) {
    if (typeof merchantId !== "string" || !merchantId) throw requestError("merchant_required", "merchantId is required");
    if (!db.store) {
      const items = db.catalog.filter((p) => p.active && p.merchantId === merchantId);
      if (items.length === 0) throw requestError("unknown_merchant", "unknown merchant");
      return items;
    }
    const merchant = await db.store.getMerchant(merchantId);
    if (!merchant) throw requestError("unknown_merchant", "unknown merchant");
    if (!merchant.verified || merchant.suspended) throw requestError("merchant_unavailable", "this merchant cannot take orders");
    return (await db.store.listProducts(merchantId)).filter((p) => p.active);
  }

  /** Live mode only: the adapter verifies the signature before anything is trusted. */
  async function applyWebhook(body) {
    const event = await payments.verifyWebhook(body.raw, body.headers);
    const order = await loadOrder(event.raw?.orderId ?? event.orderId);
    if (!order) return { error: "unknown_order" };
    const next = applyWithOpening(order, event);
    await save(next, order.state);
    return { ok: true, order: next.id, state: next.state };
  }

  return {
    "GET /catalog": () => ({ items: db.catalog.filter((p) => p.active) }),

    "GET /orders": async (_b, params) => {
      const user = await requireUser(ctx, params);
      if (db.store) return { orders: await db.store.listOrders(user.id) };
      const mine = [...db.orders.values()].filter((o) => o.buyerId === user.id);
      return { orders: mine.map((o) => ({ id: o.id, state: o.state, totalMinor: o.totalMinor, currency: o.currency })) };
    },

    "GET /orders/:id": async (_b, params) => {
      const user = await requireUser(ctx, params);
      const order = await loadOrder(params.id);
      // Someone else's order looks exactly like a missing one.
      if (!order || !(await roleFor(order, user))) return NOT_FOUND;
      return { order };
    },

    "POST /orders": async (body, params) => {
      const user = await requireUser(ctx, params);
      const catalogue = await merchantCatalogue(body.merchantId);
      const priced = priceLines(catalogue, body.items);
      const order = createOrder({
        id: `ord_${Date.now().toString(36)}_${++orderSeq}`,
        buyerId: user.id,
        merchantId: body.merchantId,
        items: priced.items,
        currency: priced.currency,
        fulfillment: orderFulfillment(catalogue, priced.items),
        terms: DEMO_TERMS,
      });
      await save(order);
      if (!payments) return { order, checkout: demoCheckout(order) };
      const result = await registeredCheckout(order, payments, registry);
      db.orders.set(order.id, result.order);
      return result;
    },

    "POST /orders/:id/events": async (body, params) => {
      if (payments) throw new AccessError("payment events come only from the provider in live mode", "demo_only");
      const { order } = await authorizedOrder(ctx, params);
      if (!order) return NOT_FOUND;
      const event = demoVerify(body);
      let next;
      try {
        next = applyWithOpening(order, event);
      } catch (error) {
        return { error: error.name ?? "error", message: error.message, state: order.state };
      }
      return save(next, order.state);
    },

    "POST /orders/:id/fulfil": async (_body, params) => {
      if (payments) throw new AccessError("demo fulfilment is disabled in live mode", "demo_only");
      const { order } = await authorizedOrder(ctx, params, MERCHANT_ONLY);
      if (!order) return NOT_FOUND;
      return transitionAndSave(order, fulfil);
    },

    "POST /orders/:id/refund": async (body, params) => {
      if (payments) throw new AccessError("demo refunds are disabled in live mode", "demo_only");
      const { order } = await authorizedOrder(ctx, params);
      if (!order) return NOT_FOUND;
      return transitionAndSave(order, (o) => refund(o, { reason: body.reason }));
    },

    // The dispatcher does not catch errors on this raw-body route, so the
    // handler never throws: every outcome is a response body.
    "POST /webhooks/nervixpay": async (body) => {
      // Unsigned demo payloads would let anyone mark any order paid.
      if (!payments) return DEMO_WEBHOOK_REFUSED;
      try {
        return await applyWebhook(body);
      } catch (error) {
        console.error("[orders] webhook rejected:", error);
        return INVALID_PAYLOAD;
      }
    },
  };
}
