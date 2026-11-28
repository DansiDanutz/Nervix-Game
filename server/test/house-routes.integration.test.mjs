/**
 * HTTP integration test for house authority against a real Postgres database.
 * Creates a throwaway database, applies every migration, loads the slice
 * fixtures and starts the real server. Skips (with a reason) when Postgres is
 * not reachable; it never touches the development database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "../seed/slice-fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "db", "migrations");
const PG_HOST = process.env.PGHOST ?? "/tmp";
const DB = `nervix_world_itest_${process.pid}`;
const PORT = 28000 + (process.pid % 700);
const BASE = `http://127.0.0.1:${PORT}`;

function pgAvailable() {
  try {
    execFileSync("psql", ["-h", PG_HOST, "-d", "postgres", "-Atc", "select 1"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const available = pgAvailable();
let server;
let pool;

async function call(method, path, sessionKey, body) {
  const headers = { "content-type": "application/json" };
  if (sessionKey) headers.authorization = `Bearer ${SESSIONS[sessionKey]}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

test.before(async () => {
  if (!available) return;
  execFileSync("createdb", ["-h", PG_HOST, DB]);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    execFileSync("psql", ["-h", PG_HOST, "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIGRATIONS, file)], { stdio: "pipe" });
  }
  const url = `postgres:///${DB}?host=${encodeURIComponent(PG_HOST)}`;
  pool = new pg.Pool({ connectionString: url });
  await applySliceFixtures(pool);
  server = spawn(process.execPath, [join(HERE, "..", "src", "index.mjs")], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(PORT), DATABASE_URL: url, NERVIX_WORLD_TEST_SUBSCRIBER: SUBSCRIBERS.join(","), NERVIXPAY_AGENT_TOKEN: "", RESEND_API_KEY: "" },
    stdio: "ignore",
  });
  await waitForServer();
});

test.after(async () => {
  server?.kill();
  await pool?.end();
  if (available) execFileSync("dropdb", ["-h", PG_HOST, "--if-exists", "--force", DB]);
});

const it = (name, fn) => test(name, { skip: available ? false : "Postgres not reachable at PGHOST" }, fn);

it("visitor can read a house but is told it cannot edit", async () => {
  const r = await call("GET", "/houses/prop_dangg", "visitor");
  assert.equal(r.status, 200);
  assert.equal(r.body.house.merchantName, "DanGG");
  assert.equal(r.body.house.merchantVerified, true);
  assert.equal(r.body.canEdit, false);
  assert.ok(r.body.house.listings.length >= 2);
});

it("owner sees canEdit on their own house only", async () => {
  assert.equal((await call("GET", "/houses/prop_dangg", "dangg")).body.canEdit, true);
  assert.equal((await call("GET", "/houses/prop_test", "dangg")).body.canEdit, false);
});

it("signed-out callers cannot edit", async () => {
  const r = await call("PATCH", "/houses/prop_dangg/profile", null, { welcome: "hi" });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "unauthorized");
});

it("visitor edit is denied", async () => {
  const r = await call("PATCH", "/houses/prop_dangg/profile", "visitor", { welcome: "pwned" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "insufficient_level");
});

it("subscription alone does not grant merchant authority", async () => {
  const r = await call("PATCH", "/houses/prop_dangg/profile", "sub", { welcome: "pwned" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "not_merchant");
});

it("an unverified merchant cannot customise even their own house", async () => {
  const r = await call("PATCH", "/houses/prop_unverified/profile", "unverified", { welcome: "hello" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "unverified_merchant");
});

it("owner edits their own welcome, decor and display, and it persists", async () => {
  const r = await call("PATCH", "/houses/prop_dangg/profile", "dangg", {
    welcome: "Welcome to the DanGG room",
    decor: { theme: "salon", accent: "#c9a441" },
    display: { featuredListingIds: ["off_dangg_2"], showApp: true },
    websiteUrl: "https://dangg.live/",
    ownerId: "usr_test",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const read = await call("GET", "/houses/prop_dangg", "visitor");
  assert.equal(read.body.house.profile.welcome, "Welcome to the DanGG room");
  assert.deepEqual(read.body.house.profile.decor, { theme: "salon", accent: "#c9a441" });
  assert.equal(read.body.house.profile.websiteUrl, "https://dangg.live/");
});

it("cross-owner profile edit is denied and leaves the target unchanged", async () => {
  const before = (await call("GET", "/houses/prop_test", "visitor")).body.house.profile;
  const r = await call("PATCH", "/houses/prop_test/profile", "dangg", { welcome: "taken over" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "cross_owner");
  const after = (await call("GET", "/houses/prop_test", "visitor")).body.house.profile;
  assert.deepEqual(after, before);
});

it("owner adds and edits listings in their own house; cross-owner listing edits are denied", async () => {
  const add = await call("POST", "/houses/prop_dangg/listings", "dangg", { name: "DanGG Pass", priceMinor: 500, currency: "eur" });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal(add.body.offering.currency, "EUR");
  const edit = await call("PATCH", `/houses/prop_dangg/listings/${add.body.offering.id}`, "dangg", { priceMinor: 650 });
  assert.equal(edit.body.offering.price_minor, 650);
  const cross = await call("PATCH", "/houses/prop_test/listings/off_test_1", "dangg", { priceMinor: 1 });
  assert.equal(cross.status, 403);
  // A listing id from another catalogue, through your own house, is also refused.
  const smuggle = await call("PATCH", "/houses/prop_dangg/listings/off_test_1", "dangg", { priceMinor: 1 });
  assert.equal(smuggle.status, 403);
  const { rows } = await pool.query("SELECT price_minor FROM builder_offerings WHERE id = 'off_test_1'");
  assert.equal(rows[0].price_minor, 750);
});

it("builder catalogue routes require the verified owner", async () => {
  const cross = await call("POST", "/builders/bld_test/offerings", "dangg", { name: "x", priceMinor: 1 });
  assert.equal(cross.status, 403);
  const sub = await call("POST", "/builders/bld_dangg/offerings", "sub", { name: "x", priceMinor: 1 });
  assert.equal(sub.status, 403);
});

it("merchant mutation routes ignore client-supplied owner ids", async () => {
  const r = await call("POST", "/merchants/mer_test/products", "dangg", { sku: "x", name: "x", unitAmountMinor: 1, currency: "EUR", fulfillment: "digital", ownerId: "usr_test" });
  assert.equal(r.status, 403);
  const anon = await call("POST", "/merchants/mer_test/apps/booking/connect", null, { config: {}, ownerId: "usr_test" });
  assert.equal(anon.status, 401);
});

it("admin routes use the session, not a userId in the request", async () => {
  const spoof = await call("POST", "/admin/merchants/mer_test/suspend", "visitor", { userId: "usr_admin_fixture" });
  assert.equal(spoof.status, 403);
  const verify = await call("POST", "/admin/merchants/mer_unverified/verify", "admin", {});
  assert.equal(verify.body.verified, true);
  const now = await call("PATCH", "/houses/prop_unverified/profile", "unverified", { welcome: "now verified" });
  assert.equal(now.status, 200, JSON.stringify(now.body));
});

it("every successful house edit is audited", async () => {
  const { rows } = await pool.query("SELECT action, actor_id FROM audit_events WHERE subject = 'prop_dangg' ORDER BY id");
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes("house.profile"));
  assert.ok(actions.includes("house.listing.add"));
  assert.ok(rows.every((r) => r.actor_id === "usr_dangg"));
});
