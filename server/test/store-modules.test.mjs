/** The store is split into domain modules with no overlapping method names. */
import test from "node:test";
import assert from "node:assert/strict";
import { STORE_MODULES } from "../src/store.mjs";

test("store modules exist for the planned domains", () => {
  for (const name of ["users", "merchants", "houses", "offerings", "orders", "conversations", "avatars"]) assert.ok(STORE_MODULES[name], name);
});

test("no method name is defined by two store modules", () => {
  const seen = new Map();
  for (const [mod, methods] of Object.entries(STORE_MODULES)) {
    for (const name of Object.keys(methods)) {
      assert.ok(!seen.has(name), `${name} in ${seen.get(name)} and ${mod}`);
      seen.set(name, mod);
    }
  }
  // 58 domain methods plus close(), which stays on the class.
  assert.equal(seen.size, 58);
  assert.ok(!seen.has("close"));
});
