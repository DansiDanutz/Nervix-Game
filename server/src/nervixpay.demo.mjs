/**
 * Demo NervixPay adapter.
 *
 * SIMULATED. No real payment is created, charged or verified. Live integration
 * requires the documented NervixPay endpoints, merchant id, signing key and
 * webhook verification method — none of which are configured here.
 *
 * The production adapter must implement the same three functions and must verify
 * payment through NervixPay's documented trusted mechanism. A redirect or an
 * agent statement is never proof of payment.
 */

export const DEMO_MODE = true;

const TIMEOUT_MS = 15 * 60 * 1000;

export function createCheckout(order, now = Date.now()) {
  if (!order?.id) throw new Error("order id required");
  return {
    provider: "nervixpay-demo",
    demo: DEMO_MODE,
    checkoutId: `demo_${order.id}`,
    url: `https://demo.nervixpay.invalid/checkout/${order.id}`,
    state: "awaiting_payment",
    expiresAt: new Date(now + TIMEOUT_MS).toISOString(),
    amountMinor: order.totalMinor,
    currency: order.currency,
    payeeId: order.merchantId,
  };
}

/**
 * Normalize a provider webhook into a ledger event.
 * In demo mode the caller supplies the outcome explicitly; production must
 * verify the signature and only then trust the payload.
 */
export function verifyWebhook(raw, { signature = null } = {}) {
  if (DEMO_MODE) {
    if (!raw?.eventId || !raw?.type) throw new Error("demo webhook needs eventId and type");
    return { eventId: raw.eventId, type: raw.type, at: raw.at ?? new Date().toISOString(), demo: true };
  }
  if (!signature) throw new Error("signature verification is required in production");
  throw new Error("production verification not implemented");
}

export const INTEGRATION_INPUTS_NEEDED = Object.freeze([
  "NERVIXPAY_BASE_URL",
  "NERVIXPAY_MERCHANT_ID",
  "NERVIXPAY_SIGNING_KEY",
  "NERVIXPAY_WEBHOOK_SECRET",
  "documented payment-status verification method",
  "supported currencies and fee model",
  "refund capability and states",
]);