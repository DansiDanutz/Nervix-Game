/** Walk-in houses: read for visitors, profile and listing edits for the verified owner. */

import { LEVELS, requireLevel, AccessError } from "../entitlement.mjs";
import { authorizeHouseEdit, canEditHouse, validateHouseProfile, checkFeaturedListings } from "../house-authority.mjs";
import { visibleListings } from "../listing-display.mjs";
import { houseEditContext } from "./guards.mjs";
import { newOffering, offeringPatch } from "./offering-input.mjs";
import { readMe } from "./me.mjs";

/**
 * `display` with featured ids narrowed to `allowedIds` (a new object; input untouched).
 * Ids stored before P1 may point at another house's listings; nobody sees those.
 */
export function ownFeaturedIds(display, allowedIds) {
  const featured = display?.featuredListingIds;
  if (!featured) return display;
  const allowed = new Set(allowedIds);
  return { ...display, featuredListingIds: featured.filter((id) => allowed.has(id)) };
}

/**
 * What this caller sees of a house. Editors see every listing (inactive ones
 * flagged); visitors see active listings only. Featured ids are narrowed to
 * the listings this caller sees. `published` stays internal.
 */
function houseView({ published: _published, ...house }, profile, canEdit) {
  const listings = canEdit ? house.listings : visibleListings(house.listings);
  const display = ownFeaturedIds(profile.display, listings.map((l) => l.id));
  return { ...house, listings, profile: { ...profile, display } };
}

export function createHouseRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /houses/:propertyId": async (_b, params) => {
      const me = await readMe(ctx, params);
      requireLevel(me.level, LEVELS.BROWSE);
      const edit = await houseEditContext(ctx, params, params.propertyId);
      const house = edit.house;
      const canEdit = canEditHouse(edit);
      // An unpublished house does not exist for anyone who may not edit it.
      if (!house || (!house.published && !canEdit)) return { error: "unknown_house" };
      const view = houseView(house, await db.store.getHouseProfile(house.propertyId), canEdit);
      // Reject mismatched listing/app ids instead of falling back.
      if (params.listing && !view.listings.some((l) => l.id === params.listing)) {
        return { error: "listing_mismatch", propertyId: house.propertyId };
      }
      if (params.app && params.app !== house.ownerId) {
        return { error: "app_mismatch", propertyId: house.propertyId };
      }
      const owner = house.merchantId ? await db.store.getMerchant(house.merchantId) : null;
      const { profile, ...shown } = view;
      return {
        house: { ...shown, merchantName: owner?.name ?? null, merchantVerified: owner?.verified ?? false, profile },
        canEdit,
        demo: false,
      };
    },

    "PATCH /houses/:propertyId/profile": async (body, params) => {
      const edit = await houseEditContext(ctx, params, params.propertyId);
      authorizeHouseEdit(edit);
      const patch = validateHouseProfile(body);
      checkFeaturedListings(patch.display, edit.house.listings.map((l) => l.id));
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
