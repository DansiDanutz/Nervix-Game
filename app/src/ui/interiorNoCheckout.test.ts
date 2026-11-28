import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P4: there is no checkout path from interiors. Static guard over every
 * interior, house and product module: none may call /orders, a payment link
 * or the order endpoints of the API client, or mount the checkout panel.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const FIXED = [
  "ui/InteriorCatalog.tsx",
  "ui/HouseEditor.tsx",
  "ui/listingEditModel.ts",
  "net/api/listingEdit.ts",
  "net/api/listingEditClient.ts",
  "world/productSlots.ts",
  "world/productSlotsKit.ts",
  "world/interiorTemplate.ts",
  "world/signboard.ts",
  "scene/InteriorRoom.tsx",
];
const BY_PREFIX: readonly [string, RegExp][] = [
  ["ui", /^(ProductCard|HouseEditor)\w*\.tsx?$/],
  ["world3d", /^(ProductDisplays|MerchantHouse)\w*\.tsx?$/],
];

const CHECKOUT = [
  /["'`/]orders\b/,
  /payment[-_ ]?link/i,
  /\bapi\s*\.\s*(orders|catalog|payDemo|fulfil|refund|createOrder|checkout)\s*\(/,
  /\bCheckoutPanel\b/,
  /\bnervixpay[_.]/i,
  /net\/api\/orders/,
];

function interiorModules(): string[] {
  const listed = BY_PREFIX.flatMap(([dir, pattern]) =>
    readdirSync(join(SRC, dir))
      .filter((f) => pattern.test(f) && !f.endsWith(".test.ts"))
      .map((f) => `${dir}/${f}`),
  );
  return [...new Set([...FIXED.filter((f) => existsSync(join(SRC, f))), ...listed])].sort();
}

const offences = (text: string) => CHECKOUT.filter((re) => re.test(text)).map(String);

test("the scan covers the product card, displays, editor and catalogue", () => {
  const files = interiorModules();
  for (const must of ["ui/ProductCard.tsx", "ui/ProductCardModel.ts", "world3d/ProductDisplays.tsx", "ui/InteriorCatalog.tsx", "ui/HouseEditor.tsx", "ui/HouseEditorListings.tsx"]) {
    assert.ok(files.includes(must), `${must} is scanned`);
  }
});

test("no interior, house or product module has a checkout or payment-link path", () => {
  const hits = interiorModules().flatMap((f) => offences(readFileSync(join(SRC, f), "utf8")).map((re) => `${f} ${re}`));
  assert.deepEqual(hits, []);
});

test("the patterns catch planted checkout calls", () => {
  for (const planted of [
    'call("/orders", body)',
    "fetch(`/api/orders/${id}`)",
    "api.payDemo(orderId)",
    "api.orders(me.id)",
    "createPaymentLink({ amount })",
    "nervixpay_create_payment_link",
    "<CheckoutPanel />",
    'import { orderEndpoints } from "../net/api/orders"',
  ]) {
    assert.notDeepEqual(offences(planted), [], planted);
  }
  assert.deepEqual(offences("updateHouseListing(propertyId, id, { active: false }) // sort orders by slot"), []);
  assert.deepEqual(offences("Verified NervixPay merchant"), [], "naming the merchant's provider is not a payment call");
});
