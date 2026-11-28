import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, createCall } from "./http.ts";
import { listingEditEndpoints as endpoints } from "./listingEdit.ts";

const listingEditEndpoints = (call: ReturnType<typeof createCall>) => endpoints(call, (code) => new ApiError(400, code, code));

type Seen = { url: string; init: RequestInit };
const fakeFetch = (seen: Seen[]) =>
  (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ offering: { id: "off_a" } }) } as Response;
  }) as unknown as typeof fetch;

test("updateHouseListing PATCHes the owner's listing under its house", async () => {
  const seen: Seen[] = [];
  const api = listingEditEndpoints(createCall(fakeFetch(seen)));
  await api.updateHouseListing("prop_a", "off_a", { category: "drink", slot: null, active: false });
  assert.equal(seen[0].url, "/api/houses/prop_a/listings/off_a");
  assert.equal(seen[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { category: "drink", slot: null, active: false });
});

test("addCategorisedListing POSTs category and slot with the listing", async () => {
  const seen: Seen[] = [];
  const api = listingEditEndpoints(createCall(fakeFetch(seen)));
  await api.addCategorisedListing("prop_a", { name: "Tea", priceMinor: 320, currency: "EUR", category: "drink", slot: 0 });
  assert.equal(seen[0].url, "/api/houses/prop_a/listings");
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { name: "Tea", priceMinor: 320, currency: "EUR", category: "drink", slot: 0 });
});

test("ids are path-encoded so a listing id cannot reach another route", async () => {
  const seen: Seen[] = [];
  const api = listingEditEndpoints(createCall(fakeFetch(seen)));
  await api.updateHouseListing("prop a", "../../orders", { active: false });
  assert.equal(seen[0].url, "/api/houses/prop%20a/listings/..%2F..%2Forders");
});

test("a refusal the server sends as a 200 { error } body still rejects with its code", async () => {
  const refuse = (async () => ({ ok: true, status: 200, json: async () => ({ error: "invalid_category" }) }) as Response) as unknown as typeof fetch;
  const api = listingEditEndpoints(createCall(refuse));
  await assert.rejects(api.updateHouseListing("prop_a", "off_a", { category: "x" }), (e: Error & { code?: string }) => e.name === "ApiError" && e.code === "invalid_category");
  await assert.rejects(api.addCategorisedListing("prop_a", { name: "x", priceMinor: 1, currency: "EUR", category: null, slot: null }), /no_catalogue|invalid_category/);
});
