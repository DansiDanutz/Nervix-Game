import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for the B4/P3 components (.tsx cannot run under node --test).
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("MerchantHouse paints only the sign board primitive via signSurfaceMeshes, never a name-only Mesh match", () => {
  const src = read("world3d", "MerchantHouse.tsx");
  assert.match(src, /signSurfaceMeshes\(root, variant\.sign\.surfaceNode\)/);
  assert.match(src, /k2OptionVisible\(obj\.userData\)/);
  assert.doesNotMatch(src, /obj\.name === variant\.sign\.surfaceNode/, "the K2 sign node is a Group; a name-only Mesh match never hits");
  assert.match(src, /console\.error\(`\[MerchantHouse\][^`]*sign left blank`\)/, "a missing board is logged, not silent");
});

test("MerchantHouses pairs houses and plots through housesOnPlots and names nodes merchant_house_<propertyId>", () => {
  const src = read("world3d", "MerchantHouse.tsx");
  assert.match(src, /housesOnPlots\(houses, plots, builtPlotIds\)/);
  assert.match(src, /name=\{merchantHouseName\(house\.propertyId\)\}/);
  assert.match(src, /dressed\.created\.forEach\(\(m\) => m\.dispose\(\)\)/);
  assert.match(src, /texture\?\.dispose\(\)/);
  assert.match(src, /class HouseBoundary extends Component/);
});

test("ProductDisplays takes the panel's house as a prop and makes no fetch of its own", () => {
  const src = read("world3d", "ProductDisplays.tsx");
  assert.match(src, /readonly house: HouseDisplaySource \| null;/);
  assert.match(src, /houseDisplay\(house\)/);
  assert.doesNotMatch(src, /\bapi\s*\.\s*house\(/);
  assert.doesNotMatch(src, /from "\.\.\/net\/api"/);
});

test("the house panel re-sends its house after every load, including the owner's saves", () => {
  const src = read("ui", "InteriorCatalog.tsx");
  assert.match(src, /onHouse\?\.\(r\.house\)/);
  assert.match(src, /<HouseEditor house=\{house\} onSaved=\{load\} \/>/);
});

test("MerchantHouse reports the painted sign mesh count on the DEV hook for E2E", () => {
  const src = read("world3d", "MerchantHouse.tsx");
  assert.match(src, /__nervixHouses/);
  assert.match(src, /signMeshes: dressed\.created\.length/);
  assert.match(src, /if \(!import\.meta\.env\.DEV\) return undefined;/);
});
