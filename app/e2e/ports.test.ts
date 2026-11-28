import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_E2E, e2ePorts } from "./ports.ts";

test("defaults are the shared slice ports and database", () => {
  assert.deepEqual(e2ePorts({}), { apiPort: 28797, webPort: 25183, db: "nervix_world_slice_e2e" });
  assert.deepEqual(e2ePorts({}), DEFAULT_E2E);
  assert.equal(Object.isFrozen(DEFAULT_E2E), true);
});

test("env overrides give a run its own ports and database", () => {
  assert.deepEqual(e2ePorts({ E2E_API_PORT: "29001", E2E_WEB_PORT: "26001", E2E_DB: "nervix_world_e2e_f1" }), {
    apiPort: 29001, webPort: 26001, db: "nervix_world_e2e_f1",
  });
});

test("empty strings fall back to the defaults", () => {
  assert.deepEqual(e2ePorts({ E2E_API_PORT: "", E2E_WEB_PORT: "", E2E_DB: "" }), DEFAULT_E2E);
});

test("peer service ports are refused", () => {
  assert.throws(() => e2ePorts({ E2E_API_PORT: "8787" }), /E2E_API_PORT 8787 belongs to another service/);
  assert.throws(() => e2ePorts({ E2E_WEB_PORT: "18787" }), /E2E_WEB_PORT 18787 belongs to another service/);
});

test("malformed or out-of-range ports are refused", () => {
  for (const bad of ["abc", "80", "70000", "29001.5", "-1"]) {
    assert.throws(() => e2ePorts({ E2E_API_PORT: bad }), /E2E_API_PORT must be an integer port in 1024-65535/);
  }
});

test("the API and web ports must differ", () => {
  assert.throws(() => e2ePorts({ E2E_API_PORT: "29001", E2E_WEB_PORT: "29001" }), /must differ/);
});

test("database names are restricted to safe identifiers", () => {
  for (const bad of ["Nervix", "x;drop", "a b", "1abc", "nervix_world"]) {
    assert.throws(() => e2ePorts({ E2E_DB: bad }), /E2E_DB/);
  }
});

test("isThrowawayDb accepts only *_e2e* names", async () => {
  const { isThrowawayDb } = await import("./ports.ts");
  assert.equal(isThrowawayDb("nervix_world_slice_e2e"), true);
  assert.equal(isThrowawayDb("nervix_world_e2e_f1"), true);
  for (const bad of ["nervix_world", "postgres", 42, undefined]) assert.equal(isThrowawayDb(bad), false);
});
