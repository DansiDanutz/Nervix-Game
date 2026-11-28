/** Slice fixtures live in seed/fixtures/*.mjs; seed/slice-fixtures.mjs keeps its exports and CLI. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

import * as legacy from "../seed/slice-fixtures.mjs";
import * as fixtures from "../seed/fixtures/index.mjs";
import { pgAvailable, createThrowawayDb } from "./helpers/db.mjs";

const CLI = fileURLToPath(new URL("../seed/slice-fixtures.mjs", import.meta.url));

test("slice-fixtures.mjs re-exports the split fixtures unchanged", () => {
  assert.equal(legacy.applySliceFixtures, fixtures.applySliceFixtures);
  assert.equal(legacy.SESSIONS, fixtures.SESSIONS);
  assert.equal(legacy.SUBSCRIBERS, fixtures.SUBSCRIBERS);
});

test("fixture sessions and subscribers keep their values", () => {
  assert.deepEqual(legacy.SUBSCRIBERS, ["usr_dangg", "usr_test", "usr_sub", "usr_unverified"]);
  assert.deepEqual(Object.keys(legacy.SESSIONS), ["dangg", "test", "visitor", "sub", "unverified", "admin"]);
  assert.equal(legacy.SESSIONS.dangg, "sess_fixture_dangg");
  assert.ok(Object.isFrozen(legacy.SESSIONS));
});

test("every session maps to a fixture user", () => {
  const ids = new Set(fixtures.USERS.map(([id]) => id));
  for (const owner of Object.values(fixtures.SESSION_OWNERS)) assert.ok(ids.has(owner), owner);
  assert.deepEqual(Object.keys(fixtures.SESSION_OWNERS), Object.keys(fixtures.SESSIONS));
});

const it = (name, fn) => test(name, { skip: pgAvailable() ? false : "Postgres not reachable at PGHOST" }, fn);

it("the CLI applies the fixtures to a throwaway database, idempotently", async () => {
  const db = createThrowawayDb({ prefix: "nervix_world_fix" });
  try {
    for (let run = 0; run < 2; run++) execFileSync(process.execPath, [CLI], { env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" });
    const pool = new pg.Pool({ connectionString: db.url });
    try {
      const count = async (t) => Number((await pool.query(`SELECT count(*) FROM ${t}`)).rows[0].count);
      assert.deepEqual(
        { users: await count("users"), merchants: await count("merchants"), properties: await count("properties"), builders: await count("builders"), offerings: await count("builder_offerings"), sessions: await count("sessions") },
        { users: 6, merchants: 3, properties: 3, builders: 2, offerings: 3, sessions: 6 },
      );
    } finally {
      await pool.end();
    }
  } finally {
    db.drop();
  }
});

test("the CLI refuses to run without DATABASE_URL", () => {
  assert.throws(() => execFileSync(process.execPath, [CLI], { env: { ...process.env, DATABASE_URL: "" }, stdio: "pipe" }));
});
