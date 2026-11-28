/**
 * P4: the owner's listing form as pure data. Turns a listing into an editable
 * draft and a draft back into the smallest PATCH (or a new-listing body) the
 * P1 server accepts. Validation mirrors server/src/listing-display.mjs so the
 * form refuses early; the server stays the authority and re-checks owner,
 * category and slot. No runtime imports, so Node tests it with type stripping.
 */

/** Mirrors shared/contracts/product-categories.json (v1, frozen); a test guards drift. */
export const CATEGORY_OPTIONS: readonly { readonly id: string; readonly label: string }[] = Object.freeze(
  [
    ["seat", "Table seat"],
    ["bundle", "Bundle"],
    ["digital", "Digital item"],
    ["drink", "Drink"],
    ["food", "Food"],
    ["merch", "Merchandise"],
    ["service", "Service"],
  ].map(([id, label]) => Object.freeze({ id, label })),
);

/** Mirrors DISPLAY_SLOT_MAX in server/src/listing-display.mjs (0-based); a test guards drift. */
export const DISPLAY_SLOT_MAX = 31;
const NAME_MAX = 80;
const CURRENCY = "EUR";
const MINOR_PER_MAJOR = 100;
const PRICE = /^\d{1,13}(?:[.,]\d{1,2})?$/;
const OTHER = "Other";

export interface EditableListing {
  readonly id: string;
  readonly name: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly slot?: number | null;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

/** Form state. `category` "" means none; `slot` "" means auto, otherwise 1-based. */
export interface ListingDraft {
  readonly name: string;
  readonly price: string;
  readonly category: string;
  readonly slot: string;
  readonly active: boolean;
}

export interface ListingPatch {
  readonly name?: string;
  readonly priceMinor?: number;
  readonly category?: string | null;
  readonly slot?: number | null;
  readonly active?: boolean;
}

export interface NewListingBody {
  readonly name: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly category: string | null;
  readonly slot: number | null;
}

type Result<K extends string, T> = Readonly<{ [P in K]: T }> | Readonly<{ error: string }>;

const isCategory = (id: unknown): id is string => typeof id === "string" && CATEGORY_OPTIONS.some((c) => c.id === id);
const freeze = <T extends object>(value: T): T => Object.freeze(value);
const fail = (error: string) => freeze({ error });

export function categoryLabel(id: string | null | undefined): string {
  return CATEGORY_OPTIONS.find((c) => c.id === id)?.label ?? OTHER;
}

/** Slot choices for the form: value is 1-based text, slot the 0-based server value. */
export function slotChoices(): readonly { readonly value: string; readonly slot: number }[] {
  return freeze(Array.from({ length: DISPLAY_SLOT_MAX + 1 }, (_, slot) => freeze({ value: String(slot + 1), slot })));
}

/** Major units ("6.50" or "6,5") to minor units, or null when it is not a price. */
export function parsePrice(text: string): number | null {
  const clean = text.trim();
  if (!PRICE.test(clean)) return null;
  const [major, minor = ""] = clean.replace(",", ".").split(".");
  const value = Number(major) * MINOR_PER_MAJOR + Number(minor.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

const priceText = (minor: number) => (minor / MINOR_PER_MAJOR).toFixed(2);

export function draftFromListing(listing: EditableListing): ListingDraft {
  const slot = Number.isSafeInteger(listing.slot) ? String((listing.slot as number) + 1) : "";
  return freeze({
    name: listing.name,
    price: priceText(listing.priceMinor),
    category: isCategory(listing.category) ? listing.category : "",
    slot,
    active: listing.active !== false,
  });
}

/** Validated draft fields, or the first user-facing error. */
function readDraft(draft: ListingDraft): Result<"fields", Required<ListingPatch>> {
  const name = draft.name.trim().slice(0, NAME_MAX);
  if (!name) return fail("Enter a name");
  const priceMinor = parsePrice(draft.price);
  if (priceMinor === null) return fail("Enter a price like 6.50");
  if (draft.category !== "" && !isCategory(draft.category)) return fail("Choose a category from the list");
  const slotNumber = draft.slot === "" ? null : Number(draft.slot);
  if (slotNumber !== null && !(Number.isSafeInteger(slotNumber) && slotNumber >= 1 && slotNumber <= DISPLAY_SLOT_MAX + 1)) {
    return fail(`Choose a slot from 1 to ${DISPLAY_SLOT_MAX + 1}`);
  }
  const slot = slotNumber === null ? null : slotNumber - 1;
  return freeze({ fields: freeze({ name, priceMinor, category: draft.category || null, slot, active: draft.active }) });
}

const KEYS = Object.freeze(["name", "priceMinor", "category", "slot", "active"] as const);

/** The smallest PATCH that turns `original` into `draft`. Only form fields are ever sent. */
export function listingPatch(original: EditableListing, draft: ListingDraft): Result<"patch", ListingPatch> {
  const read = readDraft(draft);
  if ("error" in read) return read;
  const was: Required<ListingPatch> = {
    name: original.name,
    priceMinor: original.priceMinor,
    category: isCategory(original.category) ? original.category : null,
    slot: Number.isSafeInteger(original.slot) ? (original.slot as number) : null,
    active: original.active !== false,
  };
  const changed = KEYS.filter((k) => read.fields[k] !== was[k]);
  if (!changed.length) return fail("Nothing changed");
  return freeze({ patch: freeze(Object.fromEntries(changed.map((k) => [k, read.fields[k]])) as ListingPatch) });
}

/** The POST body for a new listing; EUR is the only currency the slice offers. */
export function newListingBody(draft: ListingDraft): Result<"body", NewListingBody> {
  const read = readDraft(draft);
  if ("error" in read) return read;
  const { name, priceMinor, category, slot } = read.fields;
  return freeze({ body: freeze({ name, priceMinor, currency: CURRENCY, category, slot }) });
}
