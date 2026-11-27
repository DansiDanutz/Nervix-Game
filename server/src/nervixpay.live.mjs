/**
 * Live NervixPay adapter, built from the authoritative source in
 * ~/Projects/NervixPay (docs/webhooks.md, docs/integrations.md,
 * app/api/v1/payment-links/route.ts).
 *
 * Nothing here is invented: endpoints, scopes and the signature scheme are the
 * documented ones. The adapter is used only when NERVIXPAY_AGENT_TOKEN and
 * NERVIXPAY_BASE_URL are set; otherwise the demo adapter stays in place.
 *
 * Webhook: X-NervixPay-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const LIVE_MODE = true;
const TOLERANCE_SECONDS = 300;

export class NervixPayError extends Error {
  constructor(message, code = "nervixpay_error") {
    super(message);
    this.name = "NervixPayError";
    this.code = code;
  }
}

export function createLiveAdapter({ baseUrl, agentToken, webhookSecret }) {
  if (!baseUrl || !agentToken) throw new NervixPayError("baseUrl and agentToken are required", "not_configured");
  const base = baseUrl.replace(/\/$/, "");

  async function call(path, { method = "GET", body, scope } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${agentToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new NervixPayError(`${method} ${path} failed: ${res.status} ${detail.slice(0, 200)}`, scope ?? "http_error");
    }
    return res.json();
  }

  return {
    mode: "live",
    webhookSecret: webhookSecret ?? null,

    /** Create a shareable payment link for one order. */
    async createCheckout(order) {
      const amount = (order.totalMinor / 100).toFixed(2);
      const link = await call("/api/v1/payment-links", {
        method: "POST",
        scope: "payment_links:write",
        body: {
          linkType: "share",
          itemName: order.id,
          prices: [{ network: "polygon", currencyToken: "USDC", amount, pricingMode: "fixed" }],
          redirectUrl: `${base}/payments`,
          imageUrl: `${base}/brand/nervixpay-mark.svg`,
          accentColor: "#2f6f6a",
          backgroundColor: "#f7f1e3",
        },
      });
      const id = link.paymentLink?.id ?? link.id ?? null;
      return {
        provider: "nervixpay",
        demo: false,
        checkoutId: id,
        url: id ? `${base}/l/${id}` : null,
        state: "awaiting_payment",
        amountMinor: order.totalMinor,
        currency: order.currency,
        payeeId: order.merchantId,
      };
    },

    /** Verify a signed payment.paid webhook against the raw body bytes. */
    verifyWebhook(rawBody, headers = {}) {
      const secret = webhookSecret;
      if (!secret) throw new NervixPayError("webhook secret is not configured", "not_configured");
      const header = headers["x-nervixpay-signature"];
      if (!header) throw new NervixPayError("missing signature", "missing_signature");

      const parts = Object.fromEntries(
        String(header).split(",").map((kv) => kv.split("=").map((s) => s.trim())),
      );
      const t = Number(parts.t);
      const v1 = parts.v1;
      if (!Number.isFinite(t) || !v1) throw new NervixPayError("malformed signature", "malformed_signature");
      if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) throw new NervixPayError("stale signature", "stale_signature");

      const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(v1, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new NervixPayError("signature mismatch", "invalid_signature");

      const event = JSON.parse(rawBody.toString("utf8"));
      if (event.event !== "payment.paid") throw new NervixPayError("unsupported event", "unsupported_event");
      return { eventId: `nervixpay_${event.orderId}_${event.transactionId ?? "tx"}`, type: "payment_succeeded", at: event.paidAt ?? new Date().toISOString(), raw: event };
    },

    async getPayment(paymentId) {
      return call(`/api/v1/payments/${encodeURIComponent(paymentId)}`, { scope: "payments:read" });
    },
  };
}