/**
 * P5: the merchant agent's catalogue is the house's visible listings
 * (builder_offerings), mapped to the shape the agent and the ledger price from.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { agentCatalogue, catalogueEntry, LISTING_FULFILLMENT } from "../src/house-catalogue.mjs";
import { visibleListings } from "../src/listing-display.mjs";
import { priceLines, orderFulfillment } from "../src/ledger.mjs";

const listing = (id, overrides = {}) => Object.freeze({
  id, name: `Listing ${id}`, description: `About ${id}`, priceMinor: 1000, currency: "EUR",
  category: "merch", slot: null, sortOrder: 0, active: true, ...overrides,
});

const house = (overrides = {}) => Object.freeze({
  propertyId: "prop_a", ownerId: "usr_owner", merchantId: "mer_a", builderId: "bld_a", published: true,
  listings: Object.freeze([
    listing("off_b", { name: "Beta", priceMinor: 250, slot: 1 }),
    listing("off_a", { name: "Alpha", priceMinor: 990 }),
    listing("off_off", { name: "Gone", active: false }),
  ]),
  ...overrides,
});

test("a listing becomes a catalogue entry keyed by its id and priced by priceMinor", () => {
  const entry = catalogueEntry(listing("off_x", { priceMinor: 1750, category: "seat" }));
  assert.deepEqual({ ...entry }, {
    sku: "off_x", name: "Listing off_x", description: "About off_x", category: "seat",
    unitAmountMinor: 1750, currency: "EUR", fulfillment: LISTING_FULFILLMENT, active: true,
  });
  assert.ok(Object.isFrozen(entry));
});

test("the agent catalogue equals the house's visible listings, in house order", () => {
  const h = house();
  const catalogue = agentCatalogue(h, "usr_visitor");
  assert.deepEqual(catalogue.map((p) => p.sku), visibleListings(h.listings).map((l) => l.id));
  assert.deepEqual(catalogue.map((p) => p.sku), ["off_b", "off_a"]);
  assert.ok(Object.isFrozen(catalogue));
});

test("inactive listings never reach the agent, not even for the owner", () => {
  assert.ok(!agentCatalogue(house(), "usr_owner").some((p) => p.sku === "off_off"));
});

test("an unpublished house has no catalogue for visitors, only for its owner", () => {
  const draft = house({ published: false });
  assert.deepEqual(agentCatalogue(draft, "usr_visitor"), []);
  assert.deepEqual(agentCatalogue(draft, null), []);
  assert.deepEqual(agentCatalogue(draft, "usr_owner").map((p) => p.sku), ["off_b", "off_a"]);
});

test("no house or no bound catalogue means an empty catalogue", () => {
  assert.deepEqual(agentCatalogue(null, "usr_visitor"), []);
  assert.deepEqual(agentCatalogue(house({ builderId: null, listings: [] }), "usr_visitor"), []);
});

test("the input house is left untouched", () => {
  const h = house();
  const before = JSON.stringify(h);
  agentCatalogue(h, "usr_visitor");
  assert.equal(JSON.stringify(h), before);
});

test("the ledger prices and fulfils a cart from the agent catalogue only", () => {
  const catalogue = agentCatalogue(house(), "usr_visitor");
  const priced = priceLines(catalogue, [{ sku: "off_a", quantity: 2 }]);
  assert.equal(priced.items[0].unitAmountMinor, 990);
  assert.equal(priced.currency, "EUR");
  assert.equal(orderFulfillment(catalogue, priced.items), LISTING_FULFILLMENT);
  assert.throws(() => priceLines(catalogue, [{ sku: "off_off", quantity: 1 }]), /unknown item/);
});
