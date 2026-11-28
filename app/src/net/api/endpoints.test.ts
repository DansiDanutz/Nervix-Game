import test from "node:test";
import assert from "node:assert/strict";
import type { Call } from "./http.ts";
import { authEndpoints } from "./auth.ts";
import { merchantEndpoints } from "./merchants.ts";
import { agentEndpoints } from "./agent.ts";
import { questEndpoints } from "./quest.ts";
import { adminEndpoints } from "./admin.ts";
import { houseEndpoints } from "./houses.ts";
import { adsEndpoints } from "./ads.ts";
import { orderEndpoints } from "./orders.ts";

type Rec = [string, unknown, string | undefined];
function recorder() {
  const calls: Rec[] = [];
  const call = (async (path: string, body?: unknown, method?: string) => {
    calls.push([path, body, method]);
    return {};
  }) as Call;
  return { calls, call };
}

test("the composed surface keeps every method of the old api object", () => {
  const { call } = recorder();
  const keys = Object.keys({
    ...authEndpoints(call), ...merchantEndpoints(call), ...agentEndpoints(call), ...questEndpoints(call),
    ...adminEndpoints(call), ...houseEndpoints(call), ...adsEndpoints(call), ...orderEndpoints(call),
  }).sort();
  assert.deepEqual(keys, [
    "addHouseListing", "addProduct", "adminAudit", "adminMerchants", "adminReinstate", "adminSuspend", "advance",
    "authLogin", "authSignup", "authVerify", "builders", "campaignAction", "campaigns", "catalog", "collectSeal",
    "confirm", "createCampaign", "fulfil", "health", "house", "me", "merchantProducts", "message", "orders",
    "payDemo", "placements", "progress", "provision", "refund", "saveHouseProfile", "session", "speak",
    "updateAgent", "updateAppearance",
  ]);
});

test("auth endpoints keep their paths and bodies", async () => {
  const { calls, call } = recorder();
  const a = authEndpoints(call);
  await a.me(); await a.health();
  await a.authSignup("e@x", "Dan"); await a.authLogin("e@x"); await a.authVerify("e@x", "123");
  await a.session("usr_1"); await a.session();
  assert.deepEqual(calls, [
    ["/me", undefined, undefined], ["/health", undefined, undefined],
    ["/auth/signup", { email: "e@x", displayName: "Dan" }, undefined], ["/auth/login", { email: "e@x" }, undefined],
    ["/auth/verify", { email: "e@x", code: "123" }, undefined],
    ["/session", { userId: "usr_1" }, undefined], ["/session", { userId: undefined }, undefined],
  ]);
});

test("provision no longer sends a userId: the server uses the session", async () => {
  const { calls, call } = recorder();
  const m = merchantEndpoints(call);
  await m.provision(); await m.provision("cafe");
  assert.deepEqual(calls, [
    ["/merchants/provision", { businessType: "merchant" }, undefined],
    ["/merchants/provision", { businessType: "cafe" }, undefined],
  ]);
});

test("merchant endpoints keep their paths and bodies", async () => {
  const { calls, call } = recorder();
  const m = merchantEndpoints(call);
  const product = { sku: "s", name: "n", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital" };
  await m.merchantProducts("mer_1"); await m.addProduct("mer_1", product);
  await m.updateAgent("mer_1", "prop_1", { tone: "warm" }); await m.updateAppearance("mer_1", "prop_1", { colour: "red" });
  assert.deepEqual(calls, [
    ["/merchants/mer_1/products", undefined, undefined], ["/merchants/mer_1/products", product, undefined],
    ["/merchants/mer_1/agent", { propertyId: "prop_1", tone: "warm" }, undefined],
    ["/merchants/mer_1/appearance", { propertyId: "prop_1", colour: "red" }, undefined],
  ]);
});

test("agent endpoints keep their paths and bodies", async () => {
  const { calls, call } = recorder();
  const g = agentEndpoints(call);
  const action = { tool: "t", args: {}, confirmationRequired: true, acknowledged: false };
  await g.message("p", "hi"); await g.message("p", "hi", "tool", { a: 1 });
  await g.speak("p", "words"); await g.confirm("p", action);
  assert.deepEqual(calls, [
    ["/agent/p/message", { message: "hi", tool: undefined, args: undefined }, undefined],
    ["/agent/p/message", { message: "hi", tool: "tool", args: { a: 1 } }, undefined],
    ["/agent/p/speak", { text: "words" }, undefined], ["/agent/p/confirm", { action }, undefined],
  ]);
});

test("quest and admin endpoints keep their paths, query encoding and bodies", async () => {
  const { calls, call } = recorder();
  const q = questEndpoints(call);
  const ad = adminEndpoints(call);
  await q.progress("u 1"); await q.collectSeal("u", "seal_a"); await q.advance("u", "s2");
  await ad.adminMerchants("u&1"); await ad.adminSuspend("u", "m"); await ad.adminReinstate("u", "m"); await ad.adminAudit("u");
  assert.deepEqual(calls, [
    ["/progress?userId=u%201", undefined, undefined], ["/progress", { userId: "u", seal: "seal_a" }, undefined],
    ["/progress", { userId: "u", step: "s2" }, undefined],
    ["/admin/merchants?userId=u%261", undefined, undefined], ["/admin/merchants/m/suspend", { userId: "u" }, undefined],
    ["/admin/merchants/m/reinstate", { userId: "u" }, undefined], ["/admin/audit?userId=u", undefined, undefined],
  ]);
});

test("house endpoints keep listing/app query precedence and PATCH", async () => {
  const { calls, call } = recorder();
  const h = houseEndpoints(call);
  await h.house("p"); await h.house("p", "l 1"); await h.house("p", undefined, "app"); await h.house("p", "l", "app");
  await h.saveHouseProfile("p", { welcome: "hi" }); await h.addHouseListing("p", { name: "n", priceMinor: 1, currency: "EUR" });
  await h.builders();
  assert.deepEqual(calls, [
    ["/houses/p", undefined, undefined], ["/houses/p?listing=l%201", undefined, undefined],
    ["/houses/p?app=app", undefined, undefined], ["/houses/p?listing=l", undefined, undefined],
    ["/houses/p/profile", { welcome: "hi" }, "PATCH"], ["/houses/p/listings", { name: "n", priceMinor: 1, currency: "EUR" }, undefined],
    ["/builders", undefined, undefined],
  ]);
});

test("ads endpoints keep their paths and bodies", async () => {
  const { calls, call } = recorder();
  const d = adsEndpoints(call);
  await d.placements(); await d.campaigns(); await d.createCampaign({ a: 1 }); await d.campaignAction("c1", "pause");
  assert.deepEqual(calls, [
    ["/placements", undefined, undefined], ["/campaigns", undefined, undefined],
    ["/campaigns", { a: 1 }, undefined], ["/campaigns/c1/pause", {}, undefined],
  ]);
});

test("order endpoints keep their paths, and payDemo sends created then succeeded", async () => {
  const { calls, call } = recorder();
  const o = orderEndpoints(call);
  await o.catalog(); await o.orders("u"); await o.fulfil("o1"); await o.refund("o1", "why"); await o.payDemo("o1");
  assert.deepEqual(calls.slice(0, 4), [
    ["/catalog", undefined, undefined], ["/orders?buyerId=u", undefined, undefined],
    ["/orders/o1/fulfil", {}, undefined], ["/orders/o1/refund", { reason: "why" }, undefined],
  ]);
  assert.deepEqual(calls[4], ["/orders/o1/events", { eventId: "demo_o1_created", type: "payment_created" }, undefined]);
  const paid = calls[5][1] as { eventId: string; type: string };
  assert.match(paid.eventId, /^demo_o1_paid_\d+$/);
  assert.equal(paid.type, "payment_succeeded");
});

test("payDemo still pays when the created event fails", async () => {
  let n = 0;
  const call = (async () => {
    n += 1;
    if (n === 1) throw new Error("dup");
    return { order: { id: "o1" } };
  }) as Call;
  assert.deepEqual(await orderEndpoints(call).payDemo("o1"), { order: { id: "o1" } });
});
