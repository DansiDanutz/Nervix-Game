/** B3: the public directory query is bounded by a named LIMIT. */
import test from "node:test";
import assert from "node:assert/strict";
import { listWorldHouses, WORLD_HOUSES_LIMIT } from "../src/store/houses.mjs";

test("listWorldHouses passes a bounded LIMIT to the query", async () => {
  const seen = [];
  const pool = { query: async (text, values) => { seen.push([text, values]); return { rows: [] }; } };
  assert.deepEqual(await listWorldHouses({ pool }), []);
  const [[text, values]] = seen;
  assert.match(text, /LIMIT \$1\s*$/);
  assert.deepEqual(values, [WORLD_HOUSES_LIMIT]);
  assert.ok(Number.isInteger(WORLD_HOUSES_LIMIT) && WORLD_HOUSES_LIMIT >= 7 && WORLD_HOUSES_LIMIT <= 500);
});
