/**
 * P4: what the read-only product card shows, and which product is selected.
 * Clicking a product in a room (ProductDisplays onSelect) selects it for that
 * house only; the house panel shows the card when the selection is its own.
 * There is no order or payment path here: the card only describes a listing.
 * No runtime imports, so Node tests it with type stripping.
 */

export const CARD_NOTE = "Display only. Nothing can be bought here.";
const MINOR_PER_MAJOR = 100;
// Control, bidi-override and zero-width characters never reach the card.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

export interface CardListing {
  readonly id: string;
  readonly name: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly description?: string | null;
  readonly category?: string | null;
}

export interface ProductCardView {
  readonly listingId: string;
  readonly name: string;
  readonly description: string | null;
  readonly price: string;
  readonly category: string;
  readonly note: string;
}

export interface ProductSelection {
  readonly propertyId: string;
  readonly listingId: string;
}

const cleanText = (text: string) => text.replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim();

export function formatPrice(minor: number, currency: string): string {
  if (!Number.isFinite(minor)) return "—";
  return `${(minor / MINOR_PER_MAJOR).toFixed(2)} ${currency.toUpperCase()}`;
}

export function productCardView(listing: CardListing, labelOf: (category: string | null | undefined) => string): ProductCardView {
  const description = listing.description ? cleanText(listing.description) : "";
  return Object.freeze({
    listingId: listing.id,
    name: cleanText(listing.name),
    description: description || null,
    price: formatPrice(listing.priceMinor, listing.currency),
    category: labelOf(listing.category),
    note: CARD_NOTE,
  });
}

/** The listing with this id among the ones this house shows the viewer, or null. */
export function findCardListing<T extends CardListing>(listings: readonly T[], listingId: string | null): T | null {
  if (!listingId) return null;
  return listings.find((l) => l.id === listingId) ?? null;
}

/** A tiny external store (for useSyncExternalStore) holding one frozen selection. */
export function createProductSelection() {
  let current: ProductSelection | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ProductSelection | null) => {
    current = next;
    listeners.forEach((fn) => fn());
  };
  return Object.freeze({
    get: () => current,
    forHouse: (propertyId: string) => (current?.propertyId === propertyId ? current.listingId : null),
    select(propertyId: string, listingId: string) {
      if (!propertyId || !listingId) return;
      if (current?.propertyId === propertyId && current.listingId === listingId) return;
      set(Object.freeze({ propertyId, listingId }));
    },
    clear() {
      if (current) set(null);
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  });
}

/** The app-wide selection: the scene writes it, the house panel reads it. */
export const productSelection = createProductSelection();
