/** Published businesses, provisioning by the session user, and their catalogues. */

import { provisionProperty } from "../provision.mjs";
import { LEVELS, requireLevel, safeAppUrl } from "../entitlement.mjs";
import { authorizeMerchantEdit, authorizeHouseEdit } from "../house-authority.mjs";
import { validateProduct } from "../merchants.mjs";
import { saveMerchantProperty } from "../store/merchants.mjs";
import { caller, requireStore, houseEditContext } from "./guards.mjs";
import { readMe } from "./me.mjs";

/** The caller's merchant: the one bound to their house, else a usable one, else the first (for a precise denial). */
export function chooseMerchant(merchants, boundMerchantId = null) {
  return merchants.find((m) => m.id === boundMerchantId)
    ?? merchants.find((m) => m.verified && !m.suspended)
    ?? merchants[0]
    ?? null;
}

/**
 * Provisions (or returns) the session user's house, bound to their verified
 * merchant. Any userId in the body is ignored. Shared by POST /businesses and
 * POST /merchants/provision.
 */
export async function provisionForCaller(ctx, params, body) {
  const { db, slots } = ctx;
  const { user, level } = await caller(ctx, params);
  requireLevel(level, LEVELS.BUILD);
  requireStore(ctx);
  const existing = db.properties.find((p) => p.ownerId === user.id) ?? null;
  const bound = existing ? await db.store.getProperty(existing.id) : null;
  const merchant = chooseMerchant(await db.store.listMerchantsByOwner(user.id), bound?.merchantId);
  authorizeMerchantEdit({ user, level, merchant });

  const result = provisionProperty({
    userId: user.id, merchantId: merchant.id, businessType: body.businessType ?? "merchant", slots, existing: db.properties,
  });
  if (!result.property) return result;
  const merchantId = await saveMerchantProperty(db.store, { ...result.property, merchantId: merchant.id });
  const property = Object.freeze({ ...result.property, merchantId });
  if (result.created) db.properties = [...db.properties, property];
  return { property, created: result.created };
}

export function createBusinessRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /businesses": async (_b, params) => {
      const me = await readMe(ctx, params);
      requireLevel(me.level, LEVELS.BROWSE);
      return { businesses: await db.store.listPublishedProperties() };
    },

    "POST /businesses": async (body, params) => provisionForCaller(ctx, params, body),

    "GET /businesses/:id/catalog": async (_b, params) => {
      const me = await readMe(ctx, params);
      requireLevel(me.level, LEVELS.BROWSE);
      const property = db.store ? await db.store.getProperty(params.id) : null;
      if (!property) return { error: "not_found" };
      // Products live under the house's merchant, the same key the owner writes with.
      const items = property.merchantId ? await db.store.listProducts(property.merchantId) : [];
      return { items: items.map((i) => ({ ...i, appUrl: i.appUrl ?? null })) };
    },

    "POST /businesses/:id/products": async (body, params) => {
      const { user, level, house, merchant } = await houseEditContext(ctx, params, params.id);
      authorizeHouseEdit({ user, level, merchant, house });
      const validated = validateProduct(body);
      const safe = body.appUrl ? safeAppUrl(body.appUrl) : null;
      if (body.appUrl && !safe) return { error: "unsafe_app_url" };
      const product = safe ? { ...validated, appUrl: safe } : validated;
      await db.store.upsertProduct(house.merchantId, product);
      return { product };
    },
  };
}
