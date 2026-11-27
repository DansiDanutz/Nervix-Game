/**
 * Nervix World demo API — node:http, zero dependencies, in-memory store.
 *
 * Demo only. No Postgres, no real identity, no real payments. Every state change
 * is server-side; the client never supplies authoritative amounts or payees.
 *
 *   PORT=8787 node src/index.mjs
 */

import http from "node:http";
import { createOrder, applyPaymentEvent, fulfil, refund, ORDER_STATES } from "./ledger.mjs";
import { provisionProperty } from "./provision.mjs";
import { createCheckout, verifyWebhook, DEMO_MODE } from "./nervixpay.demo.mjs";
import { buildContext, TOOLS } from "./agent.mjs";
import { createProvider, createSpeechProvider } from "./provider.mjs";
import { PostgresStore } from "./store.mjs";
import { attachPresence } from "./presence.mjs";
import { createHash } from "node:crypto";
import { newCodeRecord, verifyCode, normalizeEmail, isValidEmail } from "./auth.mjs";
import { QUEST, newProgress, advance, collectSeal } from "./quests.mjs";
import { validateProduct, validateAgentConfig, validateAppearance } from "./merchants.mjs";
import { checkCap, monthKey } from "./usage.mjs";
import { APPS, findApp, validateConfig, healthFor, publicApp, AppError } from "./apps.mjs";
import { newState, say, confirmAndRun } from "./conversation.mjs";
import {
  createCampaign, requestPayment, markPaid, activate, tick, pause, resume, cancel,
  servableCampaign, findConflict,
} from "./campaigns.mjs";

const PORT = Number(process.env.PORT ?? 8787);
let orderSeq = 0;

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
  speech: createSpeechProvider(),
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

  "GET /orders": async (_b, params) => {
    if (!db.store) return { orders: [...db.orders.values()].map((o) => ({ id: o.id, state: o.state, totalMinor: o.totalMinor, currency: o.currency })) };
    return { orders: await db.store.listOrders(params.buyerId ?? "demo_user") };
  },

  "GET /orders/:id": async (_b, p) => {
    const order = db.store ? await db.store.getOrder(p.id) : db.orders.get(p.id);
    return order ? { order } : { error: "not_found" };
  },

  "POST /auth/signup": async (body) => {
    if (!db.store) return { error: "identity_requires_database" };
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return { error: "invalid_email" };
    const userId = `usr_${createHash("sha256").update(email).digest("hex").slice(0, 12)}`;
    const displayName = String(body.displayName ?? email.split("@")[0]).slice(0, 40);
    await db.store.createUser({ id: userId, email, displayName, verified: false });
    const record = newCodeRecord(email);
    await db.store.createCode(record);
    // The code is returned only because this is the demo; production emails it.
    return { userId, email, displayName, verified: false, devCode: record.code };
  },

  "POST /auth/login": async (body) => {
    if (!db.store) return { error: "identity_requires_database" };
    const email = normalizeEmail(body.email);
    const user = await db.store.findUserByEmail(email);
    if (!user) return { error: "no_such_user" };
    const record = newCodeRecord(email);
    await db.store.createCode(record);
    return { userId: user.id, email, devCode: record.code };
  },

  "POST /auth/verify": async (body) => {
    if (!db.store) return { error: "identity_requires_database" };
    const email = normalizeEmail(body.email);
    const record = await db.store.latestCode(email);
    const check = verifyCode({ record, code: String(body.code ?? "") });
    if (!check.ok) return { error: check.reason };
    await db.store.consumeCode(record.id);
    const user = await db.store.findUserByEmail(email);
    if (!user) return { error: "no_such_user" };
    await db.store.markVerified(user.id);
    return { userId: user.id, displayName: user.displayName, role: user.role, verified: true, demo: true };
  },

  "GET /merchants/:merchantId/products": async (_b, params) => {
    const items = db.store
      ? await db.store.listProducts(params.merchantId)
      : db.catalog.filter((p) => p.merchantId === params.merchantId);
    return { items };
  },

  "POST /merchants/:merchantId/products": async (body, params) => {
    const product = validateProduct(body);
    await db.store?.ensureMerchant(params.merchantId, body.ownerId ?? "demo_user");
    await db.store?.upsertProduct(params.merchantId, product);
    if (!db.store) {
      const i = db.catalog.findIndex((p) => p.merchantId === params.merchantId && p.sku === product.sku);
      if (i >= 0) db.catalog[i] = { ...product, merchantId: params.merchantId };
      else db.catalog.push({ ...product, merchantId: params.merchantId });
    }
    return { product };
  },

  "PATCH /merchants/:merchantId/agent": async (body, params) => {
    const config = validateAgentConfig(body);
    if (!db.store) return { error: "requires_database" };
    const property = await db.store.getProperty(body.propertyId);
    if (!property) return { error: "unknown_property" };
    await db.store.updateAgent(body.propertyId, config);
    db.agent.config = { ...db.agent.config, ...config };
    return { config };
  },

  "PATCH /merchants/:merchantId/appearance": async (body, params) => {
    const appearance = validateAppearance(body);
    if (!db.store) return { error: "requires_database" };
    const property = await db.store.getProperty(body.propertyId);
    if (!property) return { error: "unknown_property" };
    await db.store.updateAppearance(body.propertyId, appearance);
    return { appearance };
  },

  "GET /merchants/:merchantId/knowledge": async (_b, params) => {
    if (!db.store) return { items: db.agent.knowledge };
    return { items: await db.store.listKnowledge(params.merchantId) };
  },

  "POST /merchants/:merchantId/knowledge": async (body, params) => {
    const content = String(body.content ?? "").trim();
    if (!content) return { error: "content_required" };
    if (!db.store) return { error: "requires_database" };
    const id = await db.store.addKnowledge(params.merchantId, {
      kind: String(body.kind ?? "faq").slice(0, 20),
      content: content.slice(0, 8000),
      uri: body.uri ? String(body.uri).slice(0, 400) : null,
    });
    return { id, approved: false };
  },

  "POST /merchants/:merchantId/knowledge/:id/approve": async (_b, params) => {
    if (!db.store) return { error: "requires_database" };
    await db.store.approveKnowledge(params.id);
    return { approved: true };
  },

  "GET /admin/merchants": async (_b, params) => {
    if (!(await db.store?.isAdmin(params.userId))) return { error: "forbidden" };
    return { merchants: await db.store.listMerchants() };
  },

  "POST /admin/merchants/:merchantId/suspend": async (body, params) => {
    if (!(await db.store?.isAdmin(body.userId))) return { error: "forbidden" };
    await db.store.setSuspended(params.merchantId, true);
    await db.store.addAudit({ actorId: body.userId, action: "merchant.suspend", subject: params.merchantId });
    return { merchant: params.merchantId, suspended: true };
  },

  "POST /admin/merchants/:merchantId/reinstate": async (body, params) => {
    if (!(await db.store?.isAdmin(body.userId))) return { error: "forbidden" };
    await db.store.setSuspended(params.merchantId, false);
    await db.store.addAudit({ actorId: body.userId, action: "merchant.reinstate", subject: params.merchantId });
    return { merchant: params.merchantId, suspended: false };
  },

  "GET /admin/audit": async (_b, params) => {
    if (!(await db.store?.isAdmin(params.userId))) return { error: "forbidden" };
    return { events: await db.store.listAudit() };
  },

  "GET /apps": () => ({ apps: APPS.map(publicApp) }),

  "GET /merchants/:merchantId/apps": async (_b, params) => {
    if (!db.store) return { apps: APPS.map((a) => ({ ...publicApp(a), connected: false, health: "not_connected" })) };
    return { apps: await db.store.listMerchantApps(params.merchantId) };
  },

  "POST /merchants/:merchantId/apps/:appId/connect": async (body, params) => {
    const app = findApp(params.appId);
    if (!app) return { error: "unknown_app" };
    const config = validateConfig(app, body.config ?? {});
    await db.store?.ensureMerchant(params.merchantId, body.ownerId ?? "demo_user");
    await db.store?.connectApp(params.merchantId, app.id, config);
    return { app: app.id, connected: true, health: healthFor(app), config };
  },

  "DELETE /merchants/:merchantId/apps/:appId/connect": async (_b, params) => {
    if (!findApp(params.appId)) return { error: "unknown_app" };
    await db.store?.disconnectApp(params.merchantId, params.appId);
    return { app: params.appId, connected: false, health: "not_connected" };
  },

  "GET /campaigns": async () => {
    if (!db.store) return { campaigns: db.campaigns };
    return { campaigns: await db.store.listCampaigns() };
  },

  "GET /placements": async () => {
    if (!db.store) return { placements: [{ id: "plaza-1", kind: "noticeboard", priceMinor: 5000, currency: "EUR" }] };
    return { placements: await db.store.listPlacements() };
  },

  "POST /agent/:propertyId/speak": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    const text = String(body.text ?? "").slice(0, 600);
    if (!text || !db.speech.available) return { available: false, audioUrl: null };
    try {
      return { available: true, audioUrl: await db.speech.speak(text) };
    } catch (error) {
      return { available: true, audioUrl: null, error: error.message };
    }
  },

  "GET /quests/lost-seals": () => ({ quest: QUEST }),

  "GET /progress": async (_b, params) => {
    const userId = params.userId ?? "demo_user";
    await db.store?.ensureUser(userId);
    const stored = db.store ? await db.store.getProgress(userId, QUEST.id) : null;
    return { progress: stored ?? newProgress() };
  },

  "POST /progress": async (body) => {
    const userId = body.userId ?? "demo_user";
    await db.store?.ensureUser(userId);
    const stored = (db.store ? await db.store.getProgress(userId, QUEST.id) : null) ?? newProgress();
    const result = body.seal
      ? collectSeal(stored, body.seal)
      : advance(stored, body.step);
    if (result.error) return { error: result.error, progress: result.progress };
    if (db.store) {
      const p = result.progress;
      await db.store.saveProgress({ userId, questId: QUEST.id, stepIndex: p.stepIndex, seals: p.seals, completed: p.completed });
    }
    return { progress: result.progress };
  },

  "GET /catalog": () => ({ items: db.catalog.filter((p) => p.active) }),

  "POST /orders": async (body) => {
    await db.store?.ensureUser(body.buyerId);
    await db.store?.ensureMerchant(body.merchantId ?? "mer_1", body.buyerId);
    const order = createOrder({
      id: `ord_${Date.now().toString(36)}_${++orderSeq}`,
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

  "POST /orders/:id/refund": async (body, params) => {
    const order = db.orders.get(params.id) ?? (db.store ? await db.store.getOrder(params.id) : null);
    if (!order) return { error: "not_found" };
    const next = refund(order, { reason: body.reason });
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
    const merchantId = body.merchantId ?? "mer_1";
    const knowledge = db.store ? await db.store.listKnowledge(merchantId, true) : db.agent.knowledge;
    const agent = db.store ? await db.store.getAgent(params.propertyId) : null;
    const config = agent
      ? { ...db.agent.config, name: agent.name, tone: agent.tone, languages: agent.languages, allowed_actions: agent.allowed_actions }
      : db.agent.config;
    const month = monthKey();
    const usage = db.store ? await db.store.getUsage(params.propertyId, month) : { requests: 0 };
    const cap = agent?.monthly_request_cap ?? null;
    const budget = checkCap({ cap, used: usage.requests ?? 0 });
    if (!budget.allowed) return { error: "cap_reached", remaining: 0 };

    const catalog = db.store ? await db.store.listProducts(merchantId) : db.catalog;
    const ctx = {
      config,
      knowledge,
      catalog,
      context: buildContext({ config, knowledge, catalog }),
      orders: db.orders,
      state,
      userId: body.userId ?? "demo_user",
      merchantId,
    };
    const out = await say({ state, message: body.message, tool: body.tool, args: body.args ?? {}, ctx, provider: db.provider });
    await db.store?.saveConversation(params.propertyId, state);
    await db.store?.addUsage(params.propertyId, month, { requests: 1, tokens: 0 });
    return out;
  },

  "POST /agent/:propertyId/confirm": async (body, params) => {
    if (!db.properties.some((p) => p.id === params.propertyId)) return { error: "unknown_property" };
    let state = db.conversations.get(params.propertyId);
    if (!state && db.store) state = await db.store.getConversation(params.propertyId);
    if (!state) state = newState();
    db.conversations.set(params.propertyId, state);
    const catalog = db.store ? await db.store.listProducts(body.merchantId ?? "mer_1") : db.catalog;
    const ctx = {
      config: db.agent.config,
      knowledge: db.agent.knowledge,
      catalog,
      context: buildContext({ config: db.agent.config, knowledge: db.agent.knowledge, catalog }),
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

  params = { ...Object.fromEntries(url.searchParams.entries()), ...params };
  if (!handler) return send(res, 404, { error: "not_found", path });
  try {
    const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readJson(req) : {};
    return send(res, 200, await handler(body, params));
  } catch (error) {
    return send(res, 400, { error: error.name ?? "error", message: error.message });
  }
});

attachPresence(server);

async function boot() {
  if (db.store) {
    db.properties = await db.store.listProperties();
    db.campaigns = await db.store.listCampaigns();
    console.log(`loaded ${db.properties.length} properties, ${db.campaigns.length} campaigns from Postgres`);
  }
  server.listen(PORT, () => console.log(`nervix-world demo API on :${PORT} (demo=${DEMO_MODE})`));
}

boot();