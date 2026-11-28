/**
 * S1: merchant and business authority over HTTP, on a throwaway Postgres
 * database with the slice fixtures plus a few S1-only rows. Authority comes
 * from the session and verified merchant records only; body ids are ignored.
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";
import { pickTestPort } from "./helpers/ports.mjs";
import { startServer } from "./helpers/server.mjs";

const PORT_SLOT = 5;
const available = pgAvailable();

/** S1-only users, beyond the shared slice fixtures. */
const EXTRA = Object.freeze({
  fresh: { user: "usr_s1_fresh", session: "sess_s1_fresh" }, // verified merchant, no house yet
  split: { user: "usr_s1_split", session: "sess_s1_split" }, // house bound to an unverified merchant
  nohouse: { user: "usr_s1_nohouse", session: "sess_s1_nohouse" }, // verified merchant and catalogue, no house
});
const SESSION_IDS = { ...SESSIONS, ...Object.fromEntries(Object.entries(EXTRA).map(([k, v]) => [k, v.session])) };

let db;
let pool;
let server;

async function seedExtras(q) {
  for (const { user, session } of Object.values(EXTRA)) {
    await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $1, 'player', true, true)`, [user, `${user}@fixture.nervix.invalid`]);
    await q("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [session, user]);
  }
  const merchant = (id, owner, verified) => q(
    `INSERT INTO merchants (id, owner_id, business_type, name, verified_at) VALUES ($1, $2, 'merchant', $1, CASE WHEN $3 THEN now() END)`,
    [id, owner, verified]);
  await merchant("mer_s1_fresh", EXTRA.fresh.user, true);
  await merchant("mer_s1_split_ok", EXTRA.split.user, true);
  await merchant("mer_s1_split_bound", EXTRA.split.user, false);
  await merchant("mer_s1_nohouse", EXTRA.nohouse.user, true);
  await q(`INSERT INTO properties (id, owner_id, merchant_id, slot_id, district, template, address, published)
           VALUES ('prop_s1_split', $1, 'mer_s1_split_bound', 'slot-14', 'merchant-quarter', 'merchant_house', 'slot-14', true)`, [EXTRA.split.user]);
  await q("INSERT INTO builders (id, owner_id, name) VALUES ('bld_s1_split', $1, 'Split'), ('bld_s1_nohouse', $2, 'No House')",
    [EXTRA.split.user, EXTRA.nohouse.user]);
  await q(`INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency)
           VALUES ('off_s1_split', 'bld_s1_split', 'Split Item', 'S1 test listing.', 100, 'EUR')`);
}

async function call(method, path, sessionKey, body) {
  const headers = { "content-type": "application/json" };
  if (sessionKey) headers.authorization = `Bearer ${SESSION_IDS[sessionKey]}`;
  const res = await fetch(`${server.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

const sql = async (text, values) => (await pool.query(text, values)).rows;
const PRODUCT = Object.freeze({ name: "S1 Chip", unitAmountMinor: 100, currency: "EUR", fulfillment: "digital" });

test.before(async () => {
  if (!available) return;
  db = createThrowawayDb({ prefix: "nervix_world_s1" });
  pool = new pg.Pool({ connectionString: db.url });
  await applySliceFixtures(pool);
  await seedExtras((text, values) => pool.query(text, values));
  const subscribers = [...SUBSCRIBERS, ...Object.values(EXTRA).map((e) => e.user)];
  server = await startServer({ port: await pickTestPort(PORT_SLOT), env: { DATABASE_URL: db.url, NERVIX_WORLD_TEST_SUBSCRIBER: subscribers.join(",") } });
});

test.after(async () => {
  server?.stop();
  await pool?.end();
  db?.drop();
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("a subscriber without a merchant record gets 403 on provision, businesses and products", async () => {
  for (const [method, path] of [["POST", "/merchants/provision"], ["POST", "/businesses"], ["POST", "/businesses/prop_dangg/products"]]) {
    const res = await call(method, path, "sub", { userId: "usr_sub", businessType: "merchant", sku: "s1-sub", ...PRODUCT });
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.error, "not_merchant", `${method} ${path}`);
  }
  assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE owner_id = 'usr_sub'"))[0].n, 0);
});

it("an unverified merchant cannot provision", async () => {
  for (const path of ["/merchants/provision", "/businesses"]) {
    const res = await call("POST", path, "unverified", {});
    assert.equal(res.status, 403, path);
    assert.equal(res.body.error, "unverified_merchant", path);
  }
});

it("visitors and anonymous callers cannot provision", async () => {
  assert.equal((await call("POST", "/merchants/provision", "visitor", {})).status, 403);
  assert.equal((await call("POST", "/businesses", null, {})).status, 403);
});

it("provision ignores a userId in the body and uses the session user", async () => {
  const res = await call("POST", "/merchants/provision", "dangg", { userId: "usr_sub", businessType: "merchant" });
  assert.equal(res.status, 200);
  assert.equal(res.body.property.ownerId, "usr_dangg");
  assert.equal(res.body.property.id, "prop_dangg");
  assert.equal(res.body.property.merchantId, "mer_dangg");
  assert.equal(res.body.created, false);
  assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE owner_id = 'usr_sub'"))[0].n, 0);
});

it("a new house persists merchant_id equal to the caller's verified merchant", async () => {
  const first = await call("POST", "/businesses", "fresh", { userId: "usr_dangg" });
  assert.equal(first.status, 200);
  assert.equal(first.body.created, true);
  assert.equal(first.body.property.ownerId, EXTRA.fresh.user);
  assert.equal(first.body.property.merchantId, "mer_s1_fresh");
  const rows = await sql("SELECT id, owner_id, merchant_id FROM properties WHERE owner_id = $1", [EXTRA.fresh.user]);
  assert.deepEqual(rows, [{ id: first.body.property.id, owner_id: EXTRA.fresh.user, merchant_id: "mer_s1_fresh" }]);

  const again = await call("POST", "/merchants/provision", "fresh", { userId: "usr_test" });
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.equal(again.body.property.id, first.body.property.id);
  assert.equal(again.body.property.merchantId, "mer_s1_fresh");
  assert.equal((await sql("SELECT count(*)::int AS n FROM properties WHERE owner_id = $1", [EXTRA.fresh.user]))[0].n, 1);
});

it("the owner adds a product under the house's merchant, and the catalogue shows it", async () => {
  const res = await call("POST", "/businesses/prop_dangg/products", "dangg", { sku: "s1-chip", ...PRODUCT });
  assert.equal(res.status, 200);
  assert.equal(res.body.product.sku, "s1-chip");
  assert.deepEqual(await sql("SELECT merchant_id FROM products WHERE sku = 's1-chip'"), [{ merchant_id: "mer_dangg" }]);
  const catalog = await call("GET", "/businesses/prop_dangg/catalog", "visitor");
  assert.ok(catalog.body.items.some((i) => i.sku === "s1-chip"));
});

it("product writes are denied across owners, to unverified merchants and to visitors", async () => {
  const cases = [
    ["dangg", "/businesses/prop_test/products", "cross_owner"],
    ["unverified", "/businesses/prop_unverified/products", "unverified_merchant"],
    ["visitor", "/businesses/prop_dangg/products", "insufficient_level"],
    ["split", "/businesses/prop_s1_split/products", "unverified_merchant"],
    ["dangg", "/businesses/prop_nope/products", "unknown_house"],
  ];
  for (const [who, path, code] of cases) {
    const res = await call("POST", path, who, { sku: `s1-${who}`, ...PRODUCT });
    assert.equal(res.status, 403, `${who} ${path}`);
    assert.equal(res.body.error, code, `${who} ${path}`);
  }
  assert.equal((await sql("SELECT count(*)::int AS n FROM products WHERE sku IN ('s1-dangg', 's1-unverified', 's1-visitor', 's1-split')"))[0].n, 0);
});

it("unsafe app urls on products are rejected, including IP literals", async () => {
  for (const appUrl of ["https://127.0.0.1/x", "http://127.0.0.1/x", "https://10.0.0.5/", "http://10.1.2.3/", "https://[::1]/"]) {
    const res = await call("POST", "/businesses/prop_dangg/products", "dangg", { sku: "s1-unsafe", ...PRODUCT, appUrl });
    assert.equal(res.body.error, "unsafe_app_url", appUrl);
  }
});

it("a visitor never sees an unapproved knowledge item; the verified owner does", async () => {
  const added = await call("POST", "/merchants/mer_dangg/knowledge", "dangg", { content: "S1 private draft." });
  assert.equal(added.status, 200);
  assert.equal(added.body.approved, false);
  const draft = (items) => items.some((k) => k.content === "S1 private draft.");
  for (const who of [null, "visitor", "test", "sub"]) {
    const res = await call("GET", "/merchants/mer_dangg/knowledge", who);
    assert.equal(res.status, 200, String(who));
    assert.equal(draft(res.body.items), false, `${who} saw a draft`);
    assert.ok(res.body.items.every((k) => k.approved === true), String(who));
  }
  const owner = await call("GET", "/merchants/mer_dangg/knowledge", "dangg");
  assert.equal(draft(owner.body.items), true);
});

it("builder catalogue edits check the merchant bound to the house, not any verified one", async () => {
  const add = await call("POST", "/builders/bld_s1_split/offerings", "split", { name: "x", priceMinor: 100 });
  assert.equal(add.status, 403);
  assert.equal(add.body.error, "unverified_merchant");
  const patch = await call("PATCH", "/builders/bld_s1_split/offerings/off_s1_split", "split", { priceMinor: 1 });
  assert.equal(patch.status, 403);
  assert.equal(patch.body.error, "unverified_merchant");
  assert.equal((await sql("SELECT price_minor FROM builder_offerings WHERE id = 'off_s1_split'"))[0].price_minor, 100);
});

it("a catalogue whose owner has no house cannot be edited", async () => {
  const res = await call("POST", "/builders/bld_s1_nohouse/offerings", "nohouse", { name: "x", priceMinor: 100 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "unknown_house");
});

it("the verified owner still edits their own catalogue; other owners cannot", async () => {
  const own = await call("POST", "/builders/bld_dangg/offerings", "dangg", { name: "S1 Seat", priceMinor: 900 });
  assert.equal(own.status, 200);
  assert.equal(own.body.offering.name, "S1 Seat");
  const cross = await call("POST", "/builders/bld_test/offerings", "dangg", { name: "x", priceMinor: 1 });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.error, "cross_owner");
  const anon = await call("POST", "/builders/bld_dangg/offerings", null, { name: "x", priceMinor: 1 });
  assert.equal(anon.status, 401);
});

it("builder offerings reject IP-literal app urls", async () => {
  for (const appUrl of ["https://127.0.0.1/", "https://10.2.3.4/app", "http://10.0.0.1/"]) {
    const res = await call("POST", "/builders/bld_dangg/offerings", "dangg", { name: "x", priceMinor: 100, appUrl });
    assert.equal(res.body.error, "unsafe_app_url", appUrl);
  }
});
