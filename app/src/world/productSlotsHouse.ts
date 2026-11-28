/**
 * P3/P4: the 3D product display reads the same house the interior panel holds
 * (InteriorCatalog `onHouse`, re-sent after every load and every owner save),
 * never a fetch of its own, so the room and the 2D list show one snapshot and
 * a listing write shows up in 3D without re-entering. Pure; type-only imports.
 */
import type { DisplayListing } from "./productSlots";

/** Structurally the API `House` (net/api/types.ts) as far as the display needs it. */
export interface HouseDisplaySource {
  readonly propertyId: string;
  readonly listings: readonly DisplayListing[];
  readonly profile: { readonly display: { readonly featuredListingIds?: readonly string[] } };
}

export interface HouseDisplay {
  readonly propertyId: string;
  readonly listings: readonly DisplayListing[];
  readonly featuredIds: readonly string[];
}

/** The listings and featured ids of `house` (as the server showed this viewer); null until loaded. */
export function houseDisplay(house: HouseDisplaySource | null | undefined): HouseDisplay | null {
  if (!house) return null;
  return Object.freeze({
    propertyId: house.propertyId,
    listings: Object.freeze([...house.listings]),
    featuredIds: Object.freeze([...(house.profile.display.featuredListingIds ?? [])]),
  });
}
