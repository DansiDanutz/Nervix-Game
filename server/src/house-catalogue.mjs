/**
 * One catalogue source per house (P5, decision D12). The merchant agent sells
 * exactly the house's visible listings from `builder_offerings`, the catalogue
 * bound to the house's merchant. The legacy `products` table is not read here.
 * Pure: no I/O, no mutation of the input.
 */

import { visibleListings } from "./listing-display.mjs";

/**
 * builder_offerings have no fulfilment column; every listing is fulfilled
 * digitally (demo, display-only listings). One of ledger FULFILLMENT_MODES.
 */
export const LISTING_FULFILLMENT = "digital";

const EMPTY = Object.freeze([]);

/** A listing as the agent and the ledger price it: the listing id is the sku. */
export function catalogueEntry(listing) {
  return Object.freeze({
    sku: listing.id,
    name: listing.name,
    description: listing.description ?? null,
    category: listing.category ?? null,
    unitAmountMinor: listing.priceMinor,
    currency: listing.currency,
    fulfillment: LISTING_FULFILLMENT,
    active: true,
  });
}

/** Whether `viewerId` may see this house's catalogue: published, or the viewer owns it. */
const canSee = (house, viewerId) => house.published || (Boolean(viewerId) && house.ownerId === viewerId);

/**
 * The agent's catalogue for a house (`store.getHouse` shape): its visible
 * (active) listings in house order. Empty for no house, an unbound catalogue,
 * or an unpublished house seen by anyone but its owner.
 */
export function agentCatalogue(house, viewerId) {
  if (!house?.builderId || !canSee(house, viewerId)) return EMPTY;
  return Object.freeze(visibleListings(house.listings ?? []).map(catalogueEntry));
}
