/** B3: the world directory route without a database fails closed to an empty list. */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorldRoutes, WORLD_HOUSES_RATE } from "../src/routes/world.mjs";
import { AccessError } from "../src/entitlement.mjs";

test("GET /world/houses is registered and returns no houses without a database", async () => {
  const routes = createWorldRoutes({ db: { store: null } });
  assert.equal(typeof routes["GET /world/houses"], "function");
  assert.deepEqual(await routes["GET /world/houses"]({}, {}), { houses: [] });
});

test("GET /world/houses reads the store's directory when a database is configured", async () => {
  const rows = [{ propertyId: "prop_x" }];
  let used = null;
  const store = { pool: { query: async (text) => { used = text; return { rows: [] }; } } };
  const routes = createWorldRoutes({ db: { store } }, { listWorldHouses: async (s) => (s === store ? rows : []) });
  assert.deepEqual(await routes["GET /world/houses"]({}, {}), { houses: rows });
  assert.equal(used, null);
});

test("GET /world/houses is rate limited per client address (429 cap_reached), other clients unaffected, refills over time", async () => {
  let t = 0;
  const routes = createWorldRoutes({ db: { store: {} } }, { listWorldHouses: async () => [], now: () => t });
  const call = (ip) => routes["GET /world/houses"]({}, { req: { socket: { remoteAddress: ip } } });
  for (let i = 0; i < WORLD_HOUSES_RATE.burst; i += 1) await call("10.0.0.1");
  await assert.rejects(call("10.0.0.1"), (e) => e instanceof AccessError && e.code === "cap_reached");
  assert.deepEqual(await call("10.0.0.2"), { houses: [] });
  t += 1000;
  assert.deepEqual(await call("10.0.0.1"), { houses: [] });
});
