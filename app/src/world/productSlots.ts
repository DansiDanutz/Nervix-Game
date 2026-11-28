/**
 * P3: which listing stands on which interior display slot. Pure and frozen;
 * no runtime imports, so it is unit-tested with Node type stripping.
 *
 * Order: an explicit slot first, then featured listings (in featured-id
 * order), then sort order, then name, then id. A listing's `slot` is the
 * 0-based position in the template's display slots (K2 `slot_1` is position
 * 0). A contested slot goes to the server's winner (sort order, name, id, as
 * `arrangeListings` in server/src/listing-display.mjs); losers and explicit
 * slots the room does not have join the fill. What does not fit stays in the
 * 2D overflow and never gets a 3D position. Inactive listings are dropped.
 */

export type Vec3 = readonly [number, number, number];

/** The K3 fallback display; used for unknown, missing or null categories. */
export const GENERIC_CATEGORY = "generic";

/** Mirrors shared/contracts/product-categories.json (v1, frozen); a test guards drift. */
export const DEFAULT_CATEGORY_IDS: readonly string[] = Object.freeze(["seat", "bundle", "digital", "drink", "food", "merch", "service"]);

export interface DisplayListing {
  readonly id: string;
  readonly name: string;
  readonly category?: string | null;
  readonly slot?: number | null;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

/** Structurally a K2Slot from interiorTemplate.ts. */
export interface DisplaySlot {
  readonly node: string;
  readonly position: Vec3;
  readonly maxExtent: Vec3;
}

export interface OverflowListing {
  readonly listingId: string;
  readonly name: string;
  readonly category: string | null;
  readonly displayCategory: string;
  readonly featured: boolean;
}

export interface PlacedListing extends OverflowListing {
  readonly slotPosition: number;
  readonly slotNode: string;
  readonly position: Vec3;
  readonly maxExtent: Vec3;
  readonly reason: "explicit" | "fill";
}

export interface ProductLayout {
  readonly placed: readonly PlacedListing[];
  readonly overflow: readonly OverflowListing[];
}

export interface AssignOptions {
  readonly featuredIds?: readonly string[];
  readonly categories?: readonly string[];
}

interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly slot: number | null;
  readonly sortOrder: number;
  readonly featuredRank: number;
}

const copy = (v: Vec3): Vec3 => Object.freeze([v[0], v[1], v[2]]) as Vec3;
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The server's listing name rule (listing-display.mjs): lower-case code units, then raw code units. No locale. */
export const compareListingNames = (a: string, b: string): number => byCodeUnits(a.toLowerCase(), b.toLowerCase()) || byCodeUnits(a, b);

const serverRank = (a: Candidate, b: Candidate) => a.sortOrder - b.sortOrder || compareListingNames(a.name, b.name) || byCodeUnits(a.id, b.id);
const fillRank = (a: Candidate, b: Candidate) => a.featuredRank - b.featuredRank || serverRank(a, b);

/** A known K3 category id, or the generic fallback. */
export function displayCategory(category: unknown, known: readonly string[] = DEFAULT_CATEGORY_IDS): string {
  return typeof category === "string" && known.includes(category) ? category : GENERIC_CATEGORY;
}

function candidates(listings: readonly DisplayListing[], featuredIds: readonly string[]): readonly Candidate[] {
  const featured = new Map<string, number>();
  featuredIds.forEach((id, i) => featured.has(id) || featured.set(id, i));
  const all = listings
    .filter((l) => l.active !== false)
    .map((l) => ({
      id: String(l.id),
      name: String(l.name ?? ""),
      category: typeof l.category === "string" ? l.category : null,
      slot: Number.isSafeInteger(l.slot) ? (l.slot as number) : null,
      sortOrder: Number.isFinite(l.sortOrder) ? (l.sortOrder as number) : 0,
      featuredRank: featured.get(String(l.id)) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(serverRank);
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)));
}

/** Explicit claims: slot position -> the winning candidate. */
function explicitClaims(pool: readonly Candidate[], slotCount: number): ReadonlyMap<number, Candidate> {
  const claims = new Map<number, Candidate>();
  pool
    .filter((c) => c.slot !== null && c.slot >= 0 && c.slot < slotCount)
    .forEach((c) => claims.has(c.slot as number) || claims.set(c.slot as number, c));
  return claims;
}

/** Assigns active listings to display slots; see the module comment for the order. Inputs are never mutated. */
export function assignListingsToSlots(listings: readonly DisplayListing[], slots: readonly DisplaySlot[], options: AssignOptions = {}): ProductLayout {
  const known = options.categories ?? DEFAULT_CATEGORY_IDS;
  const pool = candidates(listings, options.featuredIds ?? []);
  const claims = explicitClaims(pool, slots.length);
  const claimed = new Set(claims.values());
  const fill = pool.filter((c) => !claimed.has(c)).sort(fillRank);
  const free = slots.map((_, i) => i).filter((i) => !claims.has(i));

  const base = (c: Candidate): OverflowListing =>
    Object.freeze({ listingId: c.id, name: c.name, category: c.category, displayCategory: displayCategory(c.category, known), featured: Number.isFinite(c.featuredRank) });
  const place = (c: Candidate, i: number, reason: PlacedListing["reason"]): PlacedListing =>
    Object.freeze({ ...base(c), slotPosition: i, slotNode: slots[i].node, position: copy(slots[i].position), maxExtent: copy(slots[i].maxExtent), reason });

  const placed = [
    ...[...claims].map(([i, c]) => place(c, i, "explicit")),
    ...fill.slice(0, free.length).map((c, k) => place(c, free[k], "fill")),
  ].sort((a, b) => a.slotPosition - b.slotPosition);
  return Object.freeze({ placed: Object.freeze(placed), overflow: Object.freeze(fill.slice(free.length).map(base)) });
}
