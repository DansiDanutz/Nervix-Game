/** The F0 route registry: same 61 keys, one owner module per key, deterministic dispatch. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRoutes, matchRoute, ROUTE_MODULES } from "../src/routes/index.mjs";
import { createContext } from "../src/routes/context.mjs";

const KEYS = JSON.parse(readFileSync(new URL("./snapshots/route-keys.json", import.meta.url), "utf8"));
const ctx = createContext({ env: {} });
const routes = createRoutes(ctx);

test("the registry exposes exactly the 61 snapshot keys", () => {
  assert.deepEqual(Object.keys(routes).sort(), KEYS);
});

test("every key belongs to exactly one route module", () => {
  const owners = new Map();
  for (const [name, factory] of Object.entries(ROUTE_MODULES)) {
    for (const key of Object.keys(factory(ctx))) {
      assert.ok(!owners.has(key), `${key} is in both ${owners.get(key)} and ${name}`);
      owners.set(key, name);
    }
  }
  assert.equal(owners.size, 61);
});

test("the registry names the planned route modules", () => {
  for (const name of ["session", "me", "merchants", "businesses", "builders", "houses", "orders", "progress", "agent", "admin", "presence", "world"]) {
    assert.ok(ROUTE_MODULES[name], name);
  }
});

test("each parameterised key dispatches to itself and binds its params", () => {
  for (const key of KEYS) {
    const [method, pattern] = key.split(" ");
    const path = pattern.replace(/:(\w+)/g, (_, n) => `v_${n}`);
    const found = matchRoute(routes, method, path);
    assert.equal(found.key, key, path);
    for (const n of [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1])) assert.equal(found.params[n], `v_${n}`);
  }
});

test("unknown method/path pairs do not match", () => {
  assert.equal(matchRoute(routes, "DELETE", "/orders/x").handler, undefined);
  assert.equal(matchRoute(routes, "GET", "/houses/a/b").handler, undefined);
});

test("the registry is frozen", () => {
  assert.ok(Object.isFrozen(routes));
});
