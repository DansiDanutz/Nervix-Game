/** Shared contract stubs: valid JSON, versioned, frozen, unique ids. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (name) => JSON.parse(readFileSync(new URL(`../../shared/contracts/${name}.json`, import.meta.url), "utf8"));
const CONTRACTS = { "place-ids": "places", "avatar-presets": "presets", "product-categories": "categories" };

for (const [name, listKey] of Object.entries(CONTRACTS)) {
  test(`${name} is a frozen, versioned contract with unique ids`, () => {
    const c = load(name);
    assert.equal(c.contract, name);
    assert.equal(c.version, 1);
    assert.equal(c.frozen, true);
    assert.ok(Array.isArray(c[listKey]) && c[listKey].length > 0);
    const ids = c[listKey].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9_-]*$/);
  });
}

test("place ids cover the slice places and the fixture houses", () => {
  const ids = load("place-ids").places.map((p) => p.id);
  for (const id of ["plaza", "openpoker", "prop_dangg", "prop_test"]) assert.ok(ids.includes(id), id);
});

test("avatar presets carry every palette slot as a hex colour", () => {
  for (const p of load("avatar-presets").presets) {
    for (const slot of ["skin", "hair", "eyes", "tunic", "trim", "legs"]) assert.match(p.palette[slot], /^#[0-9a-f]{6}$/i, `${p.id}.${slot}`);
  }
});
