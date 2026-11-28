/** Merchant provisioning, products, agent, appearance, knowledge and app connections. */

import { AccessError } from "../entitlement.mjs";
import { authorizeMerchantEdit } from "../house-authority.mjs";
import { validateProduct, validateAgentConfig, validateAppearance } from "../merchants.mjs";
import { APPS, findApp, validateConfig, healthFor, publicApp } from "../apps.mjs";
import { caller, requireMerchantOwner } from "./guards.mjs";
import { provisionForCaller } from "./businesses.mjs";

const KIND_MAX = 20;
const CONTENT_MAX = 8000;
const URI_MAX = 400;

/** True only for the verified, unsuspended owner of :merchantId (from the session). */
async function isVerifiedOwner(ctx, params) {
  const { user, level } = await caller(ctx, params);
  const merchant = await ctx.db.store.getMerchant(params.merchantId);
  try {
    return authorizeMerchantEdit({ user, level, merchant });
  } catch (error) {
    if (error instanceof AccessError) return false;
    throw error;
  }
}

/** The body's propertyId must be a property of :merchantId. */
async function ownProperty(db, body, params) {
  const property = await db.store.getProperty(body.propertyId);
  if (!property) return { error: "unknown_property" };
  if (property.merchantId !== params.merchantId) throw new AccessError("not your property", "cross_owner");
  return { property };
}

export function createMerchantRoutes(ctx) {
  const { db } = ctx;
  return {
    // Identity is the session user; a userId in the body is ignored.
    "POST /merchants/provision": async (body, params) => provisionForCaller(ctx, params, body),

    "GET /merchants/:merchantId/products": async (_b, params) => {
      const items = db.store
        ? await db.store.listProducts(params.merchantId)
        : db.catalog.filter((p) => p.merchantId === params.merchantId);
      return { items };
    },

    "POST /merchants/:merchantId/products": async (body, params) => {
      await requireMerchantOwner(ctx, params);
      const product = validateProduct(body);
      await db.store.upsertProduct(params.merchantId, product);
      return { product };
    },

    "PATCH /merchants/:merchantId/agent": async (body, params) => {
      await requireMerchantOwner(ctx, params);
      const config = validateAgentConfig(body);
      const owned = await ownProperty(db, body, params);
      if (owned.error) return owned;
      await db.store.updateAgent(body.propertyId, config);
      db.agent.config = { ...db.agent.config, ...config };
      return { config };
    },

    "PATCH /merchants/:merchantId/appearance": async (body, params) => {
      await requireMerchantOwner(ctx, params);
      const appearance = validateAppearance(body);
      const owned = await ownProperty(db, body, params);
      if (owned.error) return owned;
      await db.store.updateAppearance(body.propertyId, appearance);
      return { appearance };
    },

    "GET /merchants/:merchantId/knowledge": async (_b, params) => {
      // Drafts are visible only to the verified owner; everyone else sees approved items.
      if (!db.store) return { items: db.agent.knowledge.filter((k) => k.approved) };
      const approvedOnly = !(await isVerifiedOwner(ctx, params));
      return { items: await db.store.listKnowledge(params.merchantId, approvedOnly) };
    },

    "POST /merchants/:merchantId/knowledge": async (body, params) => {
      await requireMerchantOwner(ctx, params);
      const content = String(body.content ?? "").trim();
      if (!content) return { error: "content_required" };
      const id = await db.store.addKnowledge(params.merchantId, {
        kind: String(body.kind ?? "faq").slice(0, KIND_MAX),
        content: content.slice(0, CONTENT_MAX),
        uri: body.uri ? String(body.uri).slice(0, URI_MAX) : null,
      });
      return { id, approved: false };
    },

    "POST /merchants/:merchantId/knowledge/:id/approve": async (_b, params) => {
      await requireMerchantOwner(ctx, params);
      const own = await db.store.listKnowledge(params.merchantId);
      if (!own.some((k) => String(k.id) === String(params.id))) throw new AccessError("not your knowledge source", "cross_owner");
      await db.store.approveKnowledge(params.id);
      return { approved: true };
    },

    "GET /merchants/:merchantId/apps": async (_b, params) => {
      if (!db.store) return { apps: APPS.map((a) => ({ ...publicApp(a), connected: false, health: "not_connected" })) };
      return { apps: await db.store.listMerchantApps(params.merchantId) };
    },

    "POST /merchants/:merchantId/apps/:appId/connect": async (body, params) => {
      await requireMerchantOwner(ctx, params);
      const app = findApp(params.appId);
      if (!app) return { error: "unknown_app" };
      const config = validateConfig(app, body.config ?? {});
      await db.store.connectApp(params.merchantId, app.id, config);
      return { app: app.id, connected: true, health: healthFor(app), config };
    },

    "DELETE /merchants/:merchantId/apps/:appId/connect": async (_b, params) => {
      await requireMerchantOwner(ctx, params);
      if (!findApp(params.appId)) return { error: "unknown_app" };
      await db.store.disconnectApp(params.merchantId, params.appId);
      return { app: params.appId, connected: false, health: "not_connected" };
    },
  };
}
