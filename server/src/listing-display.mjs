/**
 * How listings are displayed in a house (P1): the category ids from the frozen
 * contract, bounds that mirror migration 018's CHECKs, input validation of the
 * display fields, and the deterministic order a house shows its listings in.
 * Pure: nothing here touches the database or mutates its input.
 */

import { readFileSync } from "node:fs";

const CONTRACT = JSON.parse(readFileSync(new URL("../../shared/contracts/product-categories.json", import.meta.url), "utf8"));

export const CATEGORY_IDS = Object.freeze(CONTRACT.categories.map((c) => c.id));
export const DISPLAY_SLOT_MAX = 31;
export const SORT_ORDER_LIMIT = 10000;

const isIntIn = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;

/** Each field: [body key, validator, error, nullable]. Validators take the raw value. */
const FIELDS = Object.freeze([
  ["category", (v) => typeof v === "string" && CATEGORY_IDS.includes(v), "invalid_category", true],
  ["slot", (v) => isIntIn(v, 0, DISPLAY_SLOT_MAX), "invalid_slot", true],
  ["sortOrder", (v) => isIntIn(v, -SORT_ORDER_LIMIT, SORT_ORDER_LIMIT), "invalid_sort_order", false],
  ["active", (v) => typeof v === "boolean", "invalid_active", false],
]);

/**
 * The display fields present in `body`, validated. Category and slot may be
 * null (cleared); sort order and active may not. Returns { fields } or { error }.
 */
export function displayFields(body) {
  const fields = {};
  for (const [key, valid, error, nullable] of FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null ? !nullable : !valid(value)) return { error };
    fields[key] = value;
  }
  return { fields };
}

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * THE listing name order, shared by every endpoint and by P3's client
 * assignListingsToSlots: compare String.prototype.toLowerCase() of both names
 * by UTF-16 code units, then the raw names by code units. No locale and no
 * database collation is involved, so server and client cannot drift.
 */
export const compareListingNames = (a, b) => byCodeUnits(a.toLowerCase(), b.toLowerCase()) || byCodeUnits(a, b);

const byName = (a, b) => compareListingNames(a.name, b.name);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byRank = (a, b) => (a.sortOrder - b.sortOrder) || byName(a, b) || byId(a, b);
const bySlot = (a, b) => (a.slot - b.slot) || byRank(a, b);

/** Active listings: the first by (sort order, name, id) keeps a contested slot; the rest are unplaced. */
function placeActive(active) {
  const claimed = new Set();
  const placed = [];
  for (const l of [...active].filter((x) => x.slot !== null).sort(bySlot)) {
    if (claimed.has(l.slot)) continue;
    claimed.add(l.slot);
    placed.push(l);
  }
  const winners = new Set(placed);
  const unplaced = active.filter((l) => !winners.has(l)).map((l) => ({ ...l, slot: null })).sort(byRank);
  return [...placed, ...unplaced];
}

/**
 * The order a house shows its listings in: placed active listings by slot,
 * then unplaced active ones, then inactive ones (owner view only), each by
 * (sort order, name, id). Same input set → same output, whatever the order.
 */
export function arrangeListings(listings) {
  const active = listings.filter((l) => l.active);
  const inactive = listings.filter((l) => !l.active).sort(byRank);
  return Object.freeze([...placeActive(active), ...inactive].map((l) => Object.freeze({ ...l })));
}

/** Listings by (name rule, id), e.g. a catalogue listed by name. A new array; input untouched. */
export function sortByName(listings) {
  return [...listings].sort((a, b) => byName(a, b) || byId(a, b));
}

/** What a visitor sees: the arranged active listings only. */
export function visibleListings(listings) {
  return arrangeListings(listings).filter((l) => l.active);
}
