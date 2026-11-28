import test from "node:test";
import assert from "node:assert/strict";
import type { Call } from "./http.ts";
import { DEFAULT_ACCENT, parseWorldHouses, worldEndpoints } from "./world.ts";

const entry = { plotId: "plot_a", propertyId: "prop_a", merchantName: "Merchant A", verified: true, theme: "merchant_house", accent: "#112233" };

test("worldHouses calls GET /world/houses with no body and returns the parsed list", async () => {
  const calls: [string, unknown, unknown][] = [];
  const call = (async (path: string, body?: unknown, method?: string) => {
    calls.push([path, body, method]);
    return { houses: [entry] };
  }) as Call;
  const houses = await worldEndpoints(call).worldHouses();
  assert.deepEqual(calls, [["/world/houses", undefined, undefined]]);
  assert.deepEqual(houses, [entry]);
});

test("parseWorldHouses keeps only the directory fields and freezes the result", () => {
  const [h] = parseWorldHouses({ houses: [{ ...entry, ownerId: "usr_x", extra: 1 }] });
  assert.deepEqual(Object.keys(h).sort(), ["accent", "merchantName", "plotId", "propertyId", "theme", "verified"]);
  assert.ok(Object.isFrozen(h));
  assert.ok(Object.isFrozen(parseWorldHouses({ houses: [] })));
});

test("parseWorldHouses drops malformed or unverified entries and duplicate property or plot ids", () => {
  const houses = parseWorldHouses({
    houses: [
      entry,
      { ...entry, propertyId: "prop_b", verified: false },
      { ...entry, propertyId: "bad id", plotId: "plot_c" },
      { ...entry, propertyId: "prop_d", plotId: "" },
      { ...entry, propertyId: "prop_e", merchantName: 7 },
      { ...entry, plotId: "plot_dup" },
      { ...entry, propertyId: "prop_f" },
      null,
      "x",
    ],
  });
  assert.deepEqual(houses.map((h) => h.propertyId), ["prop_a"]);
});

test("parseWorldHouses replaces a non-hex accent with the default and trims long names", () => {
  const [h] = parseWorldHouses({ houses: [{ ...entry, accent: "red; background:url(x)", merchantName: "x".repeat(200) }] });
  assert.equal(h.accent, DEFAULT_ACCENT);
  assert.equal(h.merchantName.length, 80);
});

test("parseWorldHouses returns an empty list for a body without a houses array", () => {
  for (const body of [null, undefined, {}, { houses: "x" }, []]) assert.deepEqual(parseWorldHouses(body), []);
});
