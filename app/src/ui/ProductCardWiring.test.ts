import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for P4 wiring (the .tsx files cannot run under node --test).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("ProductDisplays reports a clicked product through onSelect with its listing id", () => {
  const displays = read("world3d", "ProductDisplays.tsx");
  assert.match(displays, /onSelect\?: \(listingId: string\) => void/);
  assert.match(displays, /onClick=\{clickTo\(onSelect, item\.listingId\)\}/);
  assert.match(displays, /onSelect\(listingId\)/);
  assert.match(displays, /stopPropagation\(\)/);
});

test("the house panel opens the read-only card for the selection of its own house only", () => {
  const catalog = read("ui", "InteriorCatalog.tsx");
  assert.match(catalog, /useSelectedProduct\(door\.propertyId\)/);
  assert.match(catalog, /findCardListing\(/);
  assert.match(catalog, /<ProductCard\b/);
  const card = read("ui", "ProductCard.tsx");
  assert.match(card, /role="dialog"/);
  assert.doesNotMatch(card, /<(input|form|select|textarea)\b/, "the card is read-only");
  assert.equal((card.match(/<button\b/g) ?? []).length, 1, "the card's only button closes it");
});

test("edit controls render only when the server says canEdit", () => {
  const catalog = read("ui", "InteriorCatalog.tsx");
  assert.match(catalog, /\{canEdit && house && <HouseEditor\b/);
  const editor = read("ui", "HouseEditor.tsx");
  assert.match(editor, /<HouseEditorListings\b/);
  const listings = read("ui", "HouseEditorListings.tsx");
  assert.match(listings, /listingEditApi\.updateHouseListing\(/);
  assert.match(listings, /listingEditApi\.addCategorisedListing\(/);
  assert.match(listings, /listingPatch\(/);
  assert.match(listings, /CATEGORY_OPTIONS/);
  assert.match(listings, /active: false/);
});
