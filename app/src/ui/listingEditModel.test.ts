import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_OPTIONS,
  DISPLAY_SLOT_MAX,
  categoryLabel,
  draftFromListing,
  listingPatch,
  newListingBody,
  parsePrice,
  slotChoices,
  type EditableListing,
} from "./listingEditModel.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, "../../../shared/contracts/product-categories.json"), "utf8"));
const SERVER_DISPLAY = readFileSync(join(HERE, "../../../server/src/listing-display.mjs"), "utf8");

const SEAT: EditableListing = Object.freeze({
  id: "off_a",
  name: "Table seat",
  priceMinor: 650,
  currency: "EUR",
  description: null,
  category: "seat",
  slot: 2,
  sortOrder: 0,
  active: true,
});

test("category options mirror the frozen contract, ids and labels in order", () => {
  assert.deepEqual(
    CATEGORY_OPTIONS.map((c) => ({ id: c.id, label: c.label })),
    CONTRACT.categories.map((c: { id: string; label: string }) => ({ id: c.id, label: c.label })),
  );
  assert.ok(Object.isFrozen(CATEGORY_OPTIONS));
});

test("the slot bound mirrors the server's DISPLAY_SLOT_MAX", () => {
  const server = Number(/DISPLAY_SLOT_MAX = (\d+)/.exec(SERVER_DISPLAY)?.[1]);
  assert.equal(DISPLAY_SLOT_MAX, server);
  const choices = slotChoices();
  assert.equal(choices.length, DISPLAY_SLOT_MAX + 1);
  assert.deepEqual(choices[0], { value: "1", slot: 0 });
  assert.deepEqual(choices.at(-1), { value: String(DISPLAY_SLOT_MAX + 1), slot: DISPLAY_SLOT_MAX });
});

test("categoryLabel names known ids and calls the rest Other", () => {
  assert.equal(categoryLabel("drink"), "Drink");
  assert.equal(categoryLabel("spaceship"), "Other");
  assert.equal(categoryLabel(null), "Other");
  assert.equal(categoryLabel(undefined), "Other");
});

test("parsePrice reads major units with a dot or comma and refuses the rest", () => {
  assert.equal(parsePrice("6.50"), 650);
  assert.equal(parsePrice(" 6,5 "), 650);
  assert.equal(parsePrice("12"), 1200);
  assert.equal(parsePrice("0"), 0);
  for (const bad of ["", "  ", "-1", "6.505", "abc", "1e3", "Infinity", "99999999999999999"]) {
    assert.equal(parsePrice(bad), null, bad);
  }
});

test("draftFromListing shows a 1-based slot, the price in major units, and blanks for none", () => {
  assert.deepEqual(draftFromListing(SEAT), { name: "Table seat", price: "6.50", category: "seat", slot: "3", active: true });
  const bare = draftFromListing({ id: "x", name: "Pin", priceMinor: 5, currency: "EUR" });
  assert.deepEqual(bare, { name: "Pin", price: "0.05", category: "", slot: "", active: true });
  const unknown = draftFromListing({ ...SEAT, category: "weapon", active: false });
  assert.equal(unknown.category, "");
  assert.equal(unknown.active, false);
});

test("listingPatch sends only the fields that changed", () => {
  const draft = { ...draftFromListing(SEAT), category: "drink", slot: "" };
  assert.deepEqual(listingPatch(SEAT, draft), { patch: { category: "drink", slot: null } });
  const renamed = { ...draftFromListing(SEAT), name: "  Front seat  ", price: "7" };
  assert.deepEqual(listingPatch(SEAT, renamed), { patch: { name: "Front seat", priceMinor: 700 } });
});

test("listingPatch can deactivate and clear a category", () => {
  const draft = { ...draftFromListing(SEAT), active: false, category: "" };
  assert.deepEqual(listingPatch(SEAT, draft), { patch: { category: null, active: false } });
});

test("listingPatch refuses an unchanged draft and invalid fields", () => {
  assert.deepEqual(listingPatch(SEAT, draftFromListing(SEAT)), { error: "Nothing changed" });
  assert.deepEqual(listingPatch(SEAT, { ...draftFromListing(SEAT), name: "  " }), { error: "Enter a name" });
  assert.deepEqual(listingPatch(SEAT, { ...draftFromListing(SEAT), price: "-2" }), { error: "Enter a price like 6.50" });
  assert.deepEqual(listingPatch(SEAT, { ...draftFromListing(SEAT), category: "weapon" }), { error: "Choose a category from the list" });
  assert.deepEqual(listingPatch(SEAT, { ...draftFromListing(SEAT), slot: "0" }), { error: `Choose a slot from 1 to ${DISPLAY_SLOT_MAX + 1}` });
  assert.deepEqual(listingPatch(SEAT, { ...draftFromListing(SEAT), slot: "2.5" }), { error: `Choose a slot from 1 to ${DISPLAY_SLOT_MAX + 1}` });
});

test("listingPatch never sends ids, owner fields or a currency", () => {
  const sneaky = { ...draftFromListing(SEAT), name: "New", ownerId: "usr_x", builderId: "bld_x", id: "off_z" } as never;
  const result = listingPatch(SEAT, sneaky);
  assert.deepEqual(result, { patch: { name: "New" } });
});

test("newListingBody carries category and slot, and EUR as the only currency", () => {
  const body = newListingBody({ name: " Iced tea ", price: "3.20", category: "drink", slot: "1", active: true });
  assert.deepEqual(body, { body: { name: "Iced tea", priceMinor: 320, currency: "EUR", category: "drink", slot: 0 } });
  assert.deepEqual(newListingBody({ name: "Pin", price: "1", category: "", slot: "", active: true }), {
    body: { name: "Pin", priceMinor: 100, currency: "EUR", category: null, slot: null },
  });
  assert.deepEqual(newListingBody({ name: "", price: "1", category: "", slot: "", active: true }), { error: "Enter a name" });
});

test("results are frozen and inputs are untouched", () => {
  const draft = Object.freeze({ ...draftFromListing(SEAT), name: "Other" });
  const result = listingPatch(SEAT, draft);
  assert.ok(Object.isFrozen(result));
  assert.ok("patch" in result && Object.isFrozen(result.patch));
  assert.equal(SEAT.name, "Table seat");
  assert.ok(Object.isFrozen(draftFromListing(SEAT)));
});
