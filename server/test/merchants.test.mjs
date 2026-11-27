import test from "node:test";
import assert from "node:assert/strict";

import { validateProduct, validateAgentConfig, validateAppearance, MerchantError } from "../src/merchants.mjs";

test("a valid product is normalized", () => {
  const p = validateProduct({ sku: "coffee", name: "Coffee", unitAmountMinor: 450, currency: "eur", fulfillment: "pickup" });
  assert.equal(p.currency, "EUR");
  assert.equal(p.unitAmountMinor, 450);
  assert.equal(p.active, true);
});

test("float money and bad skus are refused", () => {
  assert.throws(() => validateProduct({ sku: "coffee", name: "C", unitAmountMinor: 1.2 }), MerchantError);
  assert.throws(() => validateProduct({ sku: "Coffee Mug", name: "C", unitAmountMinor: 100 }), MerchantError);
  assert.throws(() => validateProduct({ sku: "x", name: "C", unitAmountMinor: -1 }), MerchantError);
});

test("unknown fulfillment is refused", () => {
  assert.throws(() => validateProduct({ sku: "x", name: "C", unitAmountMinor: 1, fulfillment: "teleport" }), MerchantError);
});

test("agent config rejects unknown tools and languages", () => {
  const ok = validateAgentConfig({ name: "Mira", tone: "warm", languages: ["en", "ro"], allowed_actions: ["search_catalog"] });
  assert.deepEqual(ok.languages, ["en", "ro"]);
  assert.throws(() => validateAgentConfig({ name: "M", allowed_actions: ["rm_rf"] }), MerchantError);
  assert.throws(() => validateAgentConfig({ name: "M", languages: ["de"] }), MerchantError);
});

test("agent config defaults to read-only tools", () => {
  const cfg = validateAgentConfig({ name: "M" });
  assert.deepEqual(cfg.allowed_actions, ["search_catalog", "read_product"]);
  assert.equal(cfg.tone, "warm");
});

test("appearance whitelists templates and hex colours", () => {
  assert.equal(validateAppearance({ template: "cafe_shop", palette: "#112233" }).template, "cafe_shop");
  assert.throws(() => validateAppearance({ template: "skyscraper" }), MerchantError);
  assert.throws(() => validateAppearance({ palette: "red" }), MerchantError);
});