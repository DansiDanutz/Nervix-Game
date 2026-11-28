/** PostgresStore's public API is unchanged by the F0 split (method names snapshot). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PostgresStore } from "../src/store.mjs";

const API = JSON.parse(readFileSync(new URL("./snapshots/store-api.json", import.meta.url), "utf8"));
const methods = () => Object.getOwnPropertyNames(PostgresStore.prototype).filter((n) => n !== "constructor").sort();

test("PostgresStore keeps the same 63 public methods (59 from F0, C5 getAvatar and setAvatarPreset, C9 getPresenceSettings and setPresenceSettings)", () => {
  assert.equal(API.length, 63);
  assert.deepEqual(methods(), API);
});

test("every public store member is a function", () => {
  for (const name of API) assert.equal(typeof PostgresStore.prototype[name], "function", name);
});

test("constructing a store does not connect, and exposes the pool", async () => {
  const store = new PostgresStore("postgres:///nonexistent_db_never_used?host=%2Ftmp");
  assert.ok(store.pool);
  await store.close();
});
