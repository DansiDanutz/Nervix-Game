/** Session identity and authority guards. Identity always comes from the session. */

import { resolveLevel, AccessError } from "../entitlement.mjs";
import { authorizeMerchantEdit } from "../house-authority.mjs";
import { cookie } from "./http.mjs";

export async function resolveUser({ db }, params) {
  const token = (params.req.headers.authorization ?? "").replace(/^Bearer /i, "").trim()
    || cookie(params.req, "nervix_session");
  if (!token || !db.store) return null;
  return db.store.getSession(token);
}

/** The authenticated caller and their eligibility level, from the session only. */
export async function caller(ctx, params) {
  const user = await resolveUser(ctx, params);
  return { user, level: resolveLevel({ user }) };
}

export function requireStore({ db }) {
  if (!db.store) throw new AccessError("merchant authority requires the database", "requires_database");
}

/** Picks the caller's merchant bound to this house, else their first record (for a precise denial). */
export function pickMerchant(merchants, house) {
  return merchants.find((m) => m.id === house?.merchantId) ?? merchants[0] ?? null;
}

export async function houseEditContext(ctx, params, propertyId) {
  requireStore(ctx);
  const { user, level } = await caller(ctx, params);
  const house = await ctx.db.store.getHouse(propertyId);
  const merchant = pickMerchant(await ctx.db.store.listMerchantsByOwner(user?.id), house);
  return { user, level, house, merchant };
}

/** Caller must be the verified owner of :merchantId. Client-supplied owner ids are ignored. */
export async function requireMerchantOwner(ctx, params) {
  requireStore(ctx);
  const { user, level } = await caller(ctx, params);
  const merchant = await ctx.db.store.getMerchant(params.merchantId);
  authorizeMerchantEdit({ user, level, merchant });
  return { user, merchant };
}

export async function requireAdmin(ctx, params) {
  requireStore(ctx);
  const { user } = await caller(ctx, params);
  if (!user || !(await ctx.db.store.isAdmin(user.id))) throw new AccessError("admin only", "forbidden");
  return user;
}
