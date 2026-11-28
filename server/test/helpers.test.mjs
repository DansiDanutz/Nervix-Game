import test from "node:test";
import assert from "node:assert/strict";
import { candidatePort, pickTestPort, RESERVED_PORTS } from "./helpers/ports.mjs";
import { throwawayDbName, databaseUrl, migrationFiles } from "./helpers/db.mjs";
import { testEnv } from "./helpers/server.mjs";

test("slot 0 keeps the legacy 28000 + pid % 700 pattern", () => {
  assert.equal(candidatePort(0, 1234), 28000 + (1234 % 700));
});

test("each slot is 1000 ports apart and stays clear of reserved ports", () => {
  for (const pid of [1, 699, 797, 1497, 99999]) {
    for (const slot of [0, 1, 2]) assert.ok(!RESERVED_PORTS.includes(candidatePort(slot, pid)));
  }
  assert.equal(candidatePort(2, 5) - candidatePort(1, 5), 1000);
});

test("pickTestPort returns a free, non-reserved port", async () => {
  const port = await pickTestPort(1);
  assert.ok(Number.isInteger(port) && port >= 29000 && !RESERVED_PORTS.includes(port));
});

test("throwaway database names are unique, safe and carry the pid", () => {
  const a = throwawayDbName("my-Prefix!");
  assert.match(a, /^my_prefix__\d+_[a-z0-9]+$/);
  assert.ok(a.includes(String(process.pid)));
  assert.equal(databaseUrl("x", "/tmp"), "postgres:///x?host=%2Ftmp");
});

test("migrations are listed in order and include 001 through 015", () => {
  const files = migrationFiles();
  assert.equal(files[0], "001_init.sql");
  assert.ok(files.includes("015_house_authority.sql"));
  assert.deepEqual(files, [...files].sort());
});

test("test env blanks payment and email secrets", () => {
  const env = testEnv({ PORT: "1" });
  assert.equal(env.NERVIXPAY_AGENT_TOKEN, "");
  assert.equal(env.RESEND_API_KEY, "");
  assert.equal(env.NODE_ENV, "test");
});
