/**
 * Fixture-driven response snapshots. Runs a fixed script of requests against
 * the real server on a throwaway database with the slice fixtures, normalises
 * volatile values (timestamps, generated ids, codes) and compares status and
 * body with test/snapshots/route-responses.json. The snapshot was recorded
 * before the F0 split, so a diff means behaviour changed.
 *
 *   UPDATE_SNAPSHOTS=1 node --test test/route-snapshots.integration.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const SNAPSHOT = new URL("./snapshots/route-responses.json", import.meta.url);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const available = pgAvailable();
let db;
let server;

/** One scripted step: [label, method, path, session, body]. `$ORDER` etc. are filled from earlier steps. */
const STEPS = [
  ["health", "GET", "/health"],
  ["me anon", "GET", "/me"],
  ...Object.keys(SESSIONS).map((s) => [`me ${s}`, "GET", "/me", s]),
  ["businesses anon", "GET", "/businesses"],
  ["businesses visitor", "GET", "/businesses", "visitor"],
  ["catalog of prop_dangg", "GET", "/businesses/prop_dangg/catalog", "visitor"],
  ["catalog unknown", "GET", "/businesses/prop_nope/catalog", "visitor"],
  ["house dangg visitor", "GET", "/houses/prop_dangg", "visitor"],
  ["house dangg owner", "GET", "/houses/prop_dangg", "dangg"],
  ["house test by dangg", "GET", "/houses/prop_test", "dangg"],
  ["house listing mismatch", "GET", "/houses/prop_dangg?listing=off_test_1", "visitor"],
  ["house app mismatch", "GET", "/houses/prop_dangg?app=usr_test", "visitor"],
  ["house unknown", "GET", "/houses/prop_nope", "visitor"],
  ["house anon", "GET", "/houses/prop_dangg"],
  ["builders visitor", "GET", "/builders", "visitor"],
  ["merchant products", "GET", "/merchants/mer_dangg/products"],
  ["merchant knowledge", "GET", "/merchants/mer_dangg/knowledge"],
  ["merchant apps", "GET", "/merchants/mer_dangg/apps"],
  ["apps", "GET", "/apps"],
  ["campaigns", "GET", "/campaigns"],
  ["placements", "GET", "/placements"],
  ["servable", "GET", "/placements/plaza-1/servable"],
  ["quest", "GET", "/quests/lost-seals"],
  ["catalog", "GET", "/catalog"],
  ["progress read", "GET", "/progress?userId=usr_visitor"],
  ["progress step", "POST", "/progress", null, { userId: "usr_visitor", step: "find-fountain" }],
  ["progress bad step", "POST", "/progress", null, { userId: "usr_visitor", step: "seal-venue" }],
  ["progress reread", "GET", "/progress?userId=usr_visitor"],
  ["orders none", "GET", "/orders?buyerId=usr_visitor"],
  ["order create", "POST", "/orders", null, { buyerId: "usr_visitor", merchantId: "mer_dangg", items: [{ sku: "seat", name: "Seat", unitAmountMinor: 1750, quantity: 2 }] }],
  ["order create invalid", "POST", "/orders", null, { buyerId: "usr_visitor", items: [] }],
  ["order read", "GET", "/orders/$ORDER"],
  ["order unknown", "GET", "/orders/ord_nope"],
  ["orders list", "GET", "/orders?buyerId=usr_visitor"],
  ["order fulfil early", "POST", "/orders/$ORDER/fulfil"],
  ["order demo event", "POST", "/orders/$ORDER/events", null, { eventId: "e1", type: "payment_succeeded" }],
  ["webhook paid", "POST", "/webhooks/nervixpay", null, { event: "payment.paid", orderId: "$ORDER", transactionId: "tx1", paidAt: "2030-01-01T00:00:00.000Z" }],
  ["webhook unknown order", "POST", "/webhooks/nervixpay", null, { event: "payment.paid", orderId: "ord_nope" }],
  ["order after webhook", "GET", "/orders/$ORDER"],
  ["order refund", "POST", "/orders/$ORDER/refund", null, { reason: "snapshot" }],
  ["session fixed", "POST", "/session", null, { userId: "demo_fixed", displayName: "Fixed" }],
  ["signup", "POST", "/auth/signup", null, { email: "Snap@Example.invalid", displayName: "Snap" }],
  ["signup invalid", "POST", "/auth/signup", null, { email: "nope" }],
  ["login unknown", "POST", "/auth/login", null, { email: "ghost@example.invalid" }],
  ["login", "POST", "/auth/login", null, { email: "snap@example.invalid" }],
  ["verify wrong", "POST", "/auth/verify", null, { email: "snap@example.invalid", code: "000000x" }],
  ["verify", "POST", "/auth/verify", null, { email: "snap@example.invalid", code: "$CODE" }],
  ["me cookie", "GET", "/me", "$COOKIE"],
  ["profile", "POST", "/me/profile", "$COOKIE", { displayName: "Snapper" }],
  ["profile anon", "POST", "/me/profile", null, {}],
  ["logout", "POST", "/auth/logout", "$COOKIE"],
  ["me after logout", "GET", "/me", "$COOKIE"],
  ["profile edit anon", "PATCH", "/houses/prop_dangg/profile", null, { welcome: "hi" }],
  ["profile edit visitor", "PATCH", "/houses/prop_dangg/profile", "visitor", { welcome: "x" }],
  ["profile edit sub", "PATCH", "/houses/prop_dangg/profile", "sub", { welcome: "x" }],
  ["profile edit unverified", "PATCH", "/houses/prop_unverified/profile", "unverified", { welcome: "x" }],
  ["profile edit cross", "PATCH", "/houses/prop_test/profile", "dangg", { welcome: "x" }],
  ["profile edit invalid", "PATCH", "/houses/prop_dangg/profile", "dangg", { websiteUrl: "javascript:alert(1)" }],
  ["profile edit owner", "PATCH", "/houses/prop_dangg/profile", "dangg", { welcome: "Snapshot welcome", decor: { theme: "salon", accent: "#c9a441" } }],
  ["listing add", "POST", "/houses/prop_dangg/listings", "dangg", { name: "Snap Pass", priceMinor: 500, currency: "eur" }],
  ["listing add invalid", "POST", "/houses/prop_dangg/listings", "dangg", { name: "", priceMinor: 5 }],
  ["listing edit", "PATCH", "/houses/prop_dangg/listings/$OFFERING", "dangg", { priceMinor: 650 }],
  ["listing edit cross", "PATCH", "/houses/prop_test/listings/off_test_1", "dangg", { priceMinor: 1 }],
  ["builder offering cross", "POST", "/builders/bld_test/offerings", "dangg", { name: "x", priceMinor: 1 }],
  ["builder offering unknown", "POST", "/builders/bld_nope/offerings", "dangg", { name: "x", priceMinor: 1 }],
  ["builder offering unsafe", "POST", "/builders/bld_dangg/offerings", "dangg", { name: "x", priceMinor: 1, appUrl: "javascript:x" }],
  ["builder offering patch bad price", "PATCH", "/builders/bld_dangg/offerings/off_dangg_1", "dangg", { priceMinor: -1 }],
  ["builder offering patch", "PATCH", "/builders/bld_dangg/offerings/off_dangg_1", "dangg", { description: "Edited by snapshot." }],
  ["builder create sub", "POST", "/builders", "sub", { name: "Sub Studio" }],
  ["builder create dangg", "POST", "/builders", "dangg", { name: "DanGG Two", appUrl: "https://dangg.live/two" }],
  ["merchant product cross", "POST", "/merchants/mer_test/products", "dangg", { sku: "x", name: "x", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital" }],
  ["merchant product owner", "POST", "/merchants/mer_dangg/products", "dangg", { sku: "chip", name: "Chip", unitAmountMinor: 100, currency: "EUR", fulfillment: "digital" }],
  ["merchant products after", "GET", "/merchants/mer_dangg/products"],
  ["knowledge add anon", "POST", "/merchants/mer_dangg/knowledge", null, { content: "x" }],
  ["knowledge add empty", "POST", "/merchants/mer_dangg/knowledge", "dangg", { content: "  " }],
  ["knowledge add", "POST", "/merchants/mer_dangg/knowledge", "dangg", { content: "We deal at nine." }],
  ["knowledge approve cross", "POST", "/merchants/mer_test/knowledge/1/approve", "dangg"],
  ["knowledge approve", "POST", "/merchants/mer_dangg/knowledge/$KNOWLEDGE/approve", "dangg"],
  ["knowledge after", "GET", "/merchants/mer_dangg/knowledge"],
  ["agent patch wrong property", "PATCH", "/merchants/mer_dangg/agent", "dangg", { propertyId: "prop_test", name: "Ava", tone: "warm", languages: ["en"], allowed_actions: ["search_catalog"] }],
  ["agent patch", "PATCH", "/merchants/mer_dangg/agent", "dangg", { propertyId: "prop_dangg", name: "Ava", tone: "warm", languages: ["en"], allowed_actions: ["search_catalog"] }],
  ["appearance unknown property", "PATCH", "/merchants/mer_dangg/appearance", "dangg", { propertyId: "prop_nope", template: "merchant_house", palette: "copper" }],
  ["appearance patch", "PATCH", "/merchants/mer_dangg/appearance", "dangg", { propertyId: "prop_dangg", template: "merchant_house", palette: "copper" }],
  ["app connect unknown", "POST", "/merchants/mer_dangg/apps/nope/connect", "dangg", { config: {} }],
  ["app connect anon", "POST", "/merchants/mer_test/apps/booking/connect", null, { config: {} }],
  ["app connect", "POST", "/merchants/mer_dangg/apps/booking/connect", "dangg", { config: { calendar: "main" } }],
  ["app disconnect", "DELETE", "/merchants/mer_dangg/apps/booking/connect", "dangg"],
  ["provision visitor", "POST", "/merchants/provision", "visitor", { userId: "usr_visitor" }],
  ["provision sub", "POST", "/merchants/provision", "sub", { userId: "usr_sub", businessType: "merchant" }],
  ["businesses create visitor", "POST", "/businesses", "visitor", {}],
  ["businesses create dangg", "POST", "/businesses", "dangg", {}],
  ["business product cross", "POST", "/businesses/prop_test/products", "dangg", { sku: "y", name: "y", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital" }],
  ["business product unsafe", "POST", "/businesses/prop_dangg/products", "dangg", { sku: "y", name: "y", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital", appUrl: "javascript:x" }],
  ["agent message anon", "POST", "/agent/prop_dangg/message", null, { message: "hi" }],
  ["agent message unknown", "POST", "/agent/prop_nope/message", "visitor", { message: "hi" }],
  ["agent message", "POST", "/agent/prop_dangg/message", "visitor", { message: "What do you sell?", merchantId: "mer_dangg" }],
  ["agent confirm", "POST", "/agent/prop_dangg/confirm", null, { action: { tool: "request_support", args: {} }, merchantId: "mer_dangg" }],
  ["agent speak", "POST", "/agent/prop_dangg/speak", null, { text: "hello" }],
  ["agent speak unknown", "POST", "/agent/prop_nope/speak", null, { text: "hello" }],
  ["campaign invalid", "POST", "/campaigns", null, { id: "cmp_1" }],
  ["campaign create", "POST", "/campaigns", null, { id: "cmp_snap", merchantId: "mer_dangg", placementId: "plaza-1", priceMinor: 5000, currency: "EUR", startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-01-08T00:00:00Z" }],
  ["campaign missing", "POST", "/campaigns/cmp_nope/pause"],
  ["admin merchants visitor", "GET", "/admin/merchants", "visitor"],
  ["admin merchants", "GET", "/admin/merchants", "admin"],
  ["admin suspend spoof", "POST", "/admin/merchants/mer_test/suspend", "visitor", { userId: "usr_admin_fixture" }],
  ["admin suspend", "POST", "/admin/merchants/mer_test/suspend", "admin"],
  ["admin reinstate", "POST", "/admin/merchants/mer_test/reinstate", "admin"],
  ["admin verify unknown", "POST", "/admin/merchants/mer_nope/verify", "admin", {}],
  ["admin verify", "POST", "/admin/merchants/mer_unverified/verify", "admin", {}],
  ["admin audit", "GET", "/admin/audit", "admin"],
  ["house dangg final", "GET", "/houses/prop_dangg", "visitor"],
  ["router 404", "GET", "/no-such-route"],
];

function normalise(value, key) {
  if (key === "uptime" && typeof value === "number") return "<uptime>";
  if (key === "devCode" && value) return "<code>";
  if (typeof value === "string" && ISO.test(value)) return "<ts>";
  if (Array.isArray(value)) return value.map((v) => normalise(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v, k)]));
  return value;
}

/** Replaces generated ids captured during the run with stable placeholders. */
function scrub(json, vars) {
  let out = json;
  for (const [name, value] of Object.entries(vars)) if (value) out = out.split(value).join(`<${name}>`);
  return out;
}

async function runScript(base) {
  const vars = {};
  const results = [];
  const fill = (s) => s.replace(/\$(ORDER|OFFERING|CODE|KNOWLEDGE)/g, (_, n) => vars[n] ?? "");
  for (const [label, method, rawPath, session, rawBody] of STEPS) {
    const headers = { "content-type": "application/json" };
    if (session === "$COOKIE") headers.cookie = `nervix_session=${vars.COOKIE}`;
    else if (session) headers.authorization = `Bearer ${SESSIONS[session]}`;
    const body = rawBody === undefined ? undefined : fill(JSON.stringify(rawBody));
    const res = await fetch(`${base}${fill(rawPath)}`, { method, headers, body });
    const json = await res.json();
    const cookie = res.headers.get("set-cookie");
    if (label === "order create") vars.ORDER = json.order?.id;
    if (label === "listing add") vars.OFFERING = json.offering?.id;
    if (label === "knowledge add") vars.KNOWLEDGE = json.id;
    if (label === "login") vars.CODE = json.devCode;
    if (label === "verify") vars.COOKIE = /nervix_session=([^;]*)/.exec(cookie ?? "")?.[1];
    results.push({ label, status: res.status, setCookie: cookie ? cookie.replace(/nervix_session=[^;]+/, "nervix_session=<sid>") : null, body: normalise(json) });
  }
  return JSON.parse(scrub(JSON.stringify(results), { ORDER: vars.ORDER, OFFERING: vars.OFFERING, KNOWLEDGE: vars.KNOWLEDGE, SID: vars.COOKIE }));
}

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_snap" });
  const pool = new pg.Pool({ connectionString: db.url });
  try {
    await applySliceFixtures(pool);
  } finally {
    await pool.end();
  }
  server = await startServer({ port: await pickTestPort(2), env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(",") } });
});

test.after(() => {
  server?.stop();
  db?.drop();
});

it("fixture-driven responses match the pre-split snapshot", async () => {
  const actual = await runScript(server.base);
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 2)}\n`);
  }
  assert.ok(existsSync(SNAPSHOT), "snapshot missing: record it with UPDATE_SNAPSHOTS=1 on the pre-split code");
  const expected = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  assert.equal(actual.length, STEPS.length);
  for (let i = 0; i < expected.length; i++) assert.deepEqual(actual[i], expected[i], `step ${i}: ${expected[i].label}`);
  assert.equal(actual.length, expected.length);
});
