import test from "node:test";
import assert from "node:assert/strict";
import { createProductSelection, findCardListing, formatPrice, productCardView } from "./ProductCardModel.ts";

const LISTINGS = Object.freeze([
  Object.freeze({ id: "off_a", name: "Iced tea", priceMinor: 320, currency: "EUR", description: "Cold, with lemon.", category: "drink" }),
  Object.freeze({ id: "off_b", name: "Pin", priceMinor: 5, currency: "eur", description: null, category: "weapon" }),
]);
const label = (id: string | null | undefined) => (id === "drink" ? "Drink" : "Other");

test("formatPrice shows minor units as major with the upper-case currency", () => {
  assert.equal(formatPrice(320, "EUR"), "3.20 EUR");
  assert.equal(formatPrice(5, "eur"), "0.05 EUR");
  assert.equal(formatPrice(Number.NaN, "EUR"), "—");
});

test("productCardView is a read-only description of one listing", () => {
  const view = productCardView(LISTINGS[0], label);
  assert.deepEqual(view, {
    listingId: "off_a",
    name: "Iced tea",
    description: "Cold, with lemon.",
    price: "3.20 EUR",
    category: "Drink",
    note: "Display only. Nothing can be bought here.",
  });
  assert.ok(Object.isFrozen(view));
  assert.equal(productCardView(LISTINGS[1], label).category, "Other");
  assert.equal(productCardView(LISTINGS[1], label).description, null);
});

test("productCardView strips markup-like and control characters from text", () => {
  const view = productCardView({ ...LISTINGS[0], name: "Tea\u0007‮", description: "  \u0000hot " }, label);
  assert.equal(view.name, "Tea");
  assert.equal(view.description, "hot");
});

test("findCardListing returns the listing only when this house shows it", () => {
  assert.equal(findCardListing(LISTINGS, "off_b")?.name, "Pin");
  assert.equal(findCardListing(LISTINGS, "off_dangg_1"), null);
  assert.equal(findCardListing(LISTINGS, null), null);
});

test("the selection store is bound to a house and cleared by place", () => {
  const store = createProductSelection();
  const seen: unknown[] = [];
  const off = store.subscribe(() => seen.push(store.get()));
  assert.equal(store.get(), null);
  store.select("prop_a", "off_a");
  const first = store.get();
  assert.deepEqual(first, { propertyId: "prop_a", listingId: "off_a" });
  assert.ok(Object.isFrozen(first));
  store.select("prop_a", "off_a");
  assert.equal(store.get(), first, "same selection keeps its snapshot");
  assert.equal(store.forHouse("prop_b"), null, "another house never sees this selection");
  assert.equal(store.forHouse("prop_a"), "off_a");
  store.clear();
  assert.equal(store.get(), null);
  off();
  store.select("prop_a", "off_b");
  assert.equal(seen.length, 2, "unsubscribed listeners are not called");
});

test("the selection store refuses empty ids", () => {
  const store = createProductSelection();
  store.select("", "off_a");
  store.select("prop_a", "");
  assert.equal(store.get(), null);
});
