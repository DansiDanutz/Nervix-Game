/** OpenPoker builder catalogues and their offerings. */

import { LEVELS, requireLevel, safeAppUrl, AccessError } from "../entitlement.mjs";
import { authorizeMerchantEdit, authorizeHouseEdit } from "../house-authority.mjs";
import { caller, requireStore, pickMerchant } from "./guards.mjs";
import { newOffering, offeringPatch } from "./offering-input.mjs";
import { readMe } from "./me.mjs";

const BUILDER_ID_SUFFIX = 8;
const NAME_MAX = 80;

/** The house of a catalogue's owner (one house per owner, D4), with its bound merchant. */
async function houseOfOwner(store, ownerId) {
  const owned = (await store.listProperties()).find((p) => p.ownerId === ownerId);
  return owned ? store.getProperty(owned.id) : null;
}

/**
 * Caller must own this catalogue AND be the verified, unsuspended owner of the
 * merchant bound to the catalogue's house. Another verified merchant record of
 * the same user does not grant authority over a house bound elsewhere.
 */
async function requireBuilderOwner(ctx, params, builderId) {
  requireStore(ctx);
  const { user, level } = await caller(ctx, params);
  const builder = await ctx.db.store.getBuilder(builderId);
  if (!builder) throw new AccessError("unknown catalogue", "not_found");
  const house = await houseOfOwner(ctx.db.store, builder.ownerId);
  const merchant = pickMerchant(await ctx.db.store.listMerchantsByOwner(user?.id), house);
  authorizeMerchantEdit({ user, level, merchant });
  if (builder.ownerId !== user.id) throw new AccessError("not your catalogue", "cross_owner");
  if (!house) throw new AccessError("no house is bound to this catalogue", "unknown_house");
  authorizeHouseEdit({ user, level, merchant, house });
  return { user, builder, house };
}

export function createBuilderRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /builders": async (_b, params) => {
      const me = await readMe(ctx, params);
      requireLevel(me.level, LEVELS.BROWSE);
      const builders = await db.store.listBuilders();
      const withOfferings = [];
      for (const b of builders) withOfferings.push({ ...b, offerings: await db.store.listOfferings(b.id) });
      return { builders: withOfferings, platform: "OpenPoker", note: "OpenPoker is an open platform; each builder owns their own catalogue." };
    },

    "POST /builders": async (body, params) => {
      requireStore(ctx);
      const me = await readMe(ctx, params);
      const { user, level } = await caller(ctx, params);
      const merchants = await db.store.listMerchantsByOwner(user?.id);
      authorizeMerchantEdit({ user, level, merchant: merchants.find((m) => m.verified) ?? merchants[0] ?? null });
      const appUrl = body.appUrl ? safeAppUrl(body.appUrl) : null;
      if (body.appUrl && !appUrl) return { error: "unsafe_app_url" };
      const id = `bld_${me.userId.slice(-BUILDER_ID_SUFFIX)}`;
      await db.store.createBuilder({ id, ownerId: me.userId, name: String(body.name ?? "My studio").slice(0, NAME_MAX), appUrl });
      return { builder: await db.store.getBuilder(id) };
    },

    "POST /builders/:id/offerings": async (body, params) => {
      const { builder } = await requireBuilderOwner(ctx, params, params.id);
      const made = newOffering(body, builder.id);
      if (made.error) return made;
      await db.store.addOffering(made.offering);
      return { offering: made.offering };
    },

    "PATCH /builders/:id/offerings/:offeringId": async (body, params) => {
      await requireBuilderOwner(ctx, params, params.id);
      const { patch, error } = offeringPatch(body);
      if (error) return { error };
      // Bind to BOTH the listing and the builder: the offering must live in :id.
      const updated = await db.store.updateOffering({ offeringId: params.offeringId, builderId: params.id, patch });
      if (!updated) throw new AccessError("not your listing", "cross_owner");
      return { offering: updated };
    },
  };
}
