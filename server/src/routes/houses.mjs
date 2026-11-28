/** Walk-in houses: read for visitors, profile and listing edits for the verified owner. */

import { LEVELS, requireLevel, AccessError } from "../entitlement.mjs";
import { authorizeHouseEdit, canEditHouse, validateHouseProfile } from "../house-authority.mjs";
import { houseEditContext } from "./guards.mjs";
import { newOffering, offeringPatch } from "./offering-input.mjs";
import { readMe } from "./me.mjs";

export function createHouseRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /houses/:propertyId": async (_b, params) => {
      const me = await readMe(ctx, params);
      requireLevel(me.level, LEVELS.BROWSE);
      const edit = await houseEditContext(ctx, params, params.propertyId);
      const house = edit.house;
      if (!house) return { error: "unknown_house" };
      // Reject mismatched listing/app ids instead of falling back.
      if (params.listing && !house.listings.some((l) => l.id === params.listing)) {
        return { error: "listing_mismatch", propertyId: house.propertyId };
      }
      if (params.app && params.app !== house.ownerId) {
        return { error: "app_mismatch", propertyId: house.propertyId };
      }
      const owner = house.merchantId ? await db.store.getMerchant(house.merchantId) : null;
      const profile = await db.store.getHouseProfile(house.propertyId);
      return {
        house: { ...house, merchantName: owner?.name ?? null, merchantVerified: owner?.verified ?? false, profile },
        canEdit: canEditHouse(edit),
        demo: false,
      };
    },

    "PATCH /houses/:propertyId/profile": async (body, params) => {
      const edit = await houseEditContext(ctx, params, params.propertyId);
      authorizeHouseEdit(edit);
      const patch = validateHouseProfile(body);
      const profile = await db.store.saveHouseProfile(edit.house.propertyId, patch, edit.user.id);
      await db.store.addAudit({ actorId: edit.user.id, action: "house.profile", subject: edit.house.propertyId, detail: { fields: Object.keys(patch) } });
      return { profile };
    },

    "POST /houses/:propertyId/listings": async (body, params) => {
      const edit = await houseEditContext(ctx, params, params.propertyId);
      authorizeHouseEdit(edit);
      if (!edit.house.builderId) return { error: "no_catalogue" };
      const made = newOffering(body, edit.house.builderId);
      if (made.error) return made;
      await db.store.addOffering(made.offering);
      await db.store.addAudit({ actorId: edit.user.id, action: "house.listing.add", subject: edit.house.propertyId, detail: { listing: made.offering.id } });
      return { offering: made.offering };
    },

    "PATCH /houses/:propertyId/listings/:listingId": async (body, params) => {
      const edit = await houseEditContext(ctx, params, params.propertyId);
      authorizeHouseEdit(edit);
      const { patch, error } = offeringPatch(body);
      if (error) return { error };
      const updated = await db.store.updateOffering({ offeringId: params.listingId, builderId: edit.house.builderId, patch });
      if (!updated) throw new AccessError("not your listing", "cross_owner");
      await db.store.addAudit({ actorId: edit.user.id, action: "house.listing.edit", subject: edit.house.propertyId, detail: { listing: params.listingId } });
      return { offering: updated };
    },
  };
}
