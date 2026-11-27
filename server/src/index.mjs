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
import { buildContext, TOOLS } from "./agent.mjs";
import { createProvider } from "./provider.mjs";
import { PostgresStore } from "./store.mjs";
import { newState, say, confirmAndRun } from "./conversation.mjs";
import {
  createCampaign, requestPayment, markPaid, activate, tick, pause, resume, cancel,
  servableCampaign, findConflict,
} from "./campaigns.mjs";

const PORT = Number(process.env.PORT ?? 8787);

const slots = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `slot-${String(i + 1).padStart(2, "0")}`,
    template: "merchant_house",
    district: "merchant-quarter",
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `cafe-${i + 1}`,
    template: "cafe_shop",
    district: "coffee-courtyard",
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `venue-${i + 1}`,
    template: "casino_venue",
    district: "entertainment-district",
  })),
];

const db = {
  orders: new Map(),
  properties: [],
  campaigns: [],
  conversations: new Map(),
  provider: createProvider(),
  store: process.env.DATABASE_URL ? new PostgresStore(process.env.DATABASE_URL) : null,
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

  "POST /session": async (body) => {
    const session = {
      userId: body.userId ?? `demo_${Math.random().toString(36).slice(2, 10)}`,
      displayName: body.displayName ?? "Traveler",
      role: "player",
      demo: true,
    };
    await db.store?.ensureUser(session.userId, session.displayName);
    return session;
  },

  "POST /merchants/provision": async (body) => {
    await db.store?.ensureUser(body.userId);
    const result = provisionProperty({ userId: body.userId, businessType: body.businessType ?? "merchant", slots, existing: db.properties });
    if (result.created) {
      db.properties.push(result.property);
      await db.store?.saveProperty(result.property);
    }
    return result;
  },

  "GET /orders/:id": async (_b, p) => {
    const order = db.store ? await db.store.getOrder(p.id) : db.orders.get(p.id);
    return order ? { order } : { error: "not_found" };
  },

  "GET /catalog": () => ({ items: db.catalog.filter((p) => p.active) }),

  "POST /orders": async (body) => {
    await db.store?.ensureUser(body.buyerId);
    await db.store?.ensureMerchant(body.merchantId ?? "mer_1", body.buyerId);
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
    await db.store?.saveOrder(order);
    return { order, checkout: createCheckout(order) };
  },

  "POST /orders/:id/events": async (body, params) => {
    const order = db.orders.get(params.id);
    if (!order) return { error: "not_found" };
    const event = verifyWebhook(body);
    const next = applyPaymentEvent(order, event);
    db.orders.set(next.id, next);
    await db.store?.saveOrder(next);
    return { order: next };
  },

  "POST /orders/:id/fulfil": async (_body, params) => {
    const order = db.orders.get(params.id);
    if (!order) return { error: "not_found" };
    const next = fulfil(order);
    db.orders.set(next.id, next);
    await db.store?.saveOrder(next);
    return { order: next };
  },

  "POST /agent/:propertyId/message": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    let state = db.conversations.get(params.propertyId);
    if (!state && db.store) state = await db.store.getConversation(params.propertyId);
    if (!state) state = newState();
    db.conversations.set(params.propertyId, state);
    const ctx = {
      config: db.agent.config,
      knowledge: db.agent.knowledge,
      catalog: db.catalog,
      context: buildContext({ config: db.agent.config, knowledge: db.agent.knowledge, catalog: db.catalog }),
      orders: db.orders,
      state,
      userId: body.userId ?? "demo_user",
      merchantId: body.merchantId ?? "mer_1",
    };
    const out = await say({ state, message: body.message, tool: body.tool, args: body.args ?? {}, ctx, provider: db.provider });
    await db.store?.saveConversation(params.propertyId, state);
    return out;
  },

  "POST /agent/:propertyId/confirm": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    let state = db.conversations.get(params.propertyId);
    if (!state && db.store) state = await db.store.getConversation(params.propertyId);
    if (!state) state = newState();
    db.conversations.set(params.propertyId, state);
    const ctx = {
      config: db.agent.config,
      knowledge: db.agent.knowledge,
      catalog: db.catalog,
      context: buildContext({ config: db.agent.config, knowledge: db.agent.knowledge, catalog: db.catalog }),
      orders: db.orders,
      state,
      userId: body.userId ?? "demo_user",
      merchantId: body.merchantId ?? "mer_1",
    };
    const result = confirmAndRun({ action: body.action, ctx });
    await db.store?.saveConversation(params.propertyId, state);
    return { result };
  },

  "POST /campaigns": async (body) => {
    const campaign = createCampaign(body);
    const conflict = findConflict(campaign, db.campaigns);
    if (conflict) return { error: "placement_conflict", conflictWith: conflict.id };
    db.campaigns.push(campaign); await db.store?.saveCampaign(campaign);
    return { campaign };
  },

  "POST /campaigns/:id/request-payment": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = requestPayment(db.campaigns[i]); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/pay": async (body, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = markPaid(db.campaigns[i], { verified: body.verified === true }); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/tick": async (body, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = tick(db.campaigns[i], body.now); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/pause": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = pause(db.campaigns[i]); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/resume": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = resume(db.campaigns[i]); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "POST /campaigns/:id/cancel": async (_b, p) => {
    const i = db.campaigns.findIndex((c) => c.id === p.id);
    if (i < 0) return { error: "not_found" };
    db.campaigns[i] = cancel(db.campaigns[i]); await db.store?.saveCampaign(db.campaigns[i]);
    return { campaign: db.campaigns[i] };
  },

  "GET /placements/:id/servable": async (_b, p) => {
    const now = new Date().toISOString();
    const campaign = servableCampaign(db.campaigns, p.id, now);
    return { servable: Boolean(campaign), campaign: campaign ?? null };
  },
};

const server = http.createServer(async (req, res) => {
  // The Vite dev server runs on another origin; the API is public demo data.
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

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

async function boot() {
  if (db.store) {
    db.properties = await db.store.listProperties();
    db.campaigns = await db.store.listCampaigns();
    console.log(`loaded ${db.properties.length} properties, ${db.campaigns.length} campaigns from Postgres`);
  }
  server.listen(PORT, () => console.log(`nervix-world demo API on :${PORT} (demo=${DEMO_MODE})`));
}

boot();