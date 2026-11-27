/**
 * Nervix World demo API — node:http, zero dependencies, in-memory store.
 *
 * Demo only. No Postgres, no real identity, no real payments. Every state change
 * is server-side; the client never supplies authoritative amounts or payees.
 *
 *   PORT=8787 node src/index.mjs
 */

import http from "node:http";
import { createOrder, applyPaymentEvent, fulfil, ORDER_STATES } from "./ledger.mjs";
import { provisionProperty } from "./provision.mjs";
import { createCheckout, verifyWebhook, DEMO_MODE } from "./nervixpay.demo.mjs";
import { buildContext, plan, confirm, TOOLS } from "./agent.mjs";
import {
  createCampaign, requestPayment, markPaid, activate, tick, pause, resume, cancel,
  servableCampaign, findConflict,
} from "./campaigns.mjs";

const PORT = Number(process.env.PORT ?? 8787);

const slots = [
  { id: "slot-01", template: "merchant_house", district: "merchant-quarter" },
  { id: "slot-02", template: "merchant_house", district: "merchant-quarter" },
  { id: "slot-03", template: "cafe_shop", district: "coffee-courtyard" },
  { id: "slot-07", template: "casino_venue", district: "entertainment-district" },
];

const db = {
  orders: new Map(),
  properties: [],
  campaigns: [],
  catalog: [
    { sku: "coffee", name: "Coffee", unitAmountMinor: 450, currency: "EUR", fulfillment: "pickup", active: true, merchantId: "mer_1" },
    { sku: "pastry", name: "Pastry", unitAmountMinor: 300, currency: "EUR", fulfillment: "pickup", active: true, merchantId: "mer_1" },
  ],
  agent: {
    config: { name: "Mira", tone: "warm", languages: ["en", "ro"], allowed_actions: [TOOLS.SEARCH_CATALOG, TOOLS.READ_PRODUCT, TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT] },
    knowledge: [
      { id: "k1", kind: "faq", content: "We open at 08:00 and close at 20:00.", approved: true },
      { id: "k2", kind: "doc", content: "Internal cost data.", approved: false },
    ],
  },
};

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const routes = {
  "GET /health": () => ({ ok: true, demo: DEMO_MODE, uptime: process.uptime() }),

  "POST /session": async (body) => ({
    userId: body.userId ?? `demo_${Math.random().toString(36).slice(2, 10)}`,
    displayName: body.displayName ?? "Traveler",
    role: "player",
    demo: true,
  }),

  "POST /merchants/provision": async (body) => {
    const result = provisionProperty({ userId: body.userId, businessType: body.businessType ?? "merchant", slots, existing: db.properties });
    if (result.created) db.properties.push(result.property);
    return result;
  },

  "GET /catalog": () => ({ items: db.catalog.filter((p) => p.active) }),

  "POST /orders": async (body) => {
    const order = createOrder({
      id: `ord_${db.orders.size + 1}`,
      buyerId: body.buyerId,
      merchantId: body.merchantId ?? "mer_1",
      items: body.items,
      currency: body.currency ?? "EUR",
      fulfillment: body.fulfillment ?? "pickup",
      terms: body.terms ?? "demo",
    });
    db.orders.set(order.id, order);
    return { order, checkout: createCheckout(order) };
  },

  "POST /orders/:id/events": async (body, params) => {
    const order = db.orders.get(params.id);
    if (!order) return { error: "not_found" };
    const event = verifyWebhook(body);
    const next = applyPaymentEvent(order, event);
    db.orders.set(next.id, next);
    return { order: next };
  },

  "POST /orders/:id/fulfil": async (_body, params) => {
    const order = db.orders.get(params.id);
    if (!order) return { error: "not_found" };
    const next = fulfil(order);
    db.orders.set(next.id, next);
    return { order: next };
  },

  "POST /agent/:propertyId/message": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    const context = buildContext({ config: db.agent.config, knowledge: db.agent.knowledge, catalog: db.catalog });
    return plan({ message: body.message, context, config: db.agent.config, tool: body.tool });
  },

  "POST /agent/:propertyId/confirm": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    return { action: confirm(body.action) };
  },

  "POST /campaigns": async (body) => {
    const campaign = createCampaign(body);
    const conflict = findConflict(campaign, db.campaigns);
    if (conflict) return { error: "placement_conflict", conflictWith: conflict.id };
    db.campaigns.push(campaign);
    return { campaign };
  },

  "POST /campaigns/:id/request-payment": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = requestPayment(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/pay": async (body, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = markPaid(db.campaigns[i], { verified: body.verified === true });
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/tick": async (body, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = tick(db.campaigns[i], body.now);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/pause": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = pause(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/resume": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = resume(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/cancel": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = cancel(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "GET /placements/:id/servable": async (_b, p) => {
    const now = new Date().toISOString();
    const campaign = servableCampaign(db.campaigns, p.id, now);
    return { servable: Boolean(campaign), campaign: campaign ?? null };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const key = `${req.method} ${path}`;

  let handler = routes[key];
  let params = {};
  if (!handler) {
    for (const route of Object.keys(routes)) {
      const [method, pattern] = route.split(" ");
      if (method !== req.method) continue;
      const names = [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const re = new RegExp(`^${pattern.replace(/:(\w+)/g, "([^/]+)")}$`);
      const found = re.exec(path);
      if (!found) continue;
      handler = routes[route];
      params = Object.fromEntries(names.map((n, i) => [n, found[i + 1]]));
      break;
    }
  }

  if (!handler) return send(res, 404, { error: "not_found", path });
  try {
    const body = req.method === "POST" ? await readJson(req) : {};
    return send(res, 200, await handler(body, params));
  } catch (error) {
    return send(res, 400, { error: error.name ?? "error", message: error.message });
  }
});

server.listen(PORT, () => console.log(`nervix-world demo API on :${PORT} (demo=${DEMO_MODE})`));