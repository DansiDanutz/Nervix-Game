import test from "node:test";
import assert from "node:assert/strict";

import { APPS, findApp, validateConfig, healthFor, publicApp, AppError } from "../src/apps.mjs";

test("the catalog is non-empty and every app has an id", () => {
  assert.ok(APPS.length >= 3);
  for (const app of APPS) assert.ok(app.id && app.name);
});

test("unknown apps are not found", () => {
  assert.equal(findApp("nope"), null);
});

test("config must carry every declared field", () => {
  const booking = findApp("booking");
  assert.deepEqual(validateConfig(booking, { calendar: "main" }), { calendar: "main" });
  assert.throws(() => validateConfig(booking, {}), AppError);
  assert.throws(() => validateConfig(booking, { calendar: "  " }), AppError);
});

test("an app with no fields accepts an empty object", () => {
  assert.deepEqual(validateConfig(findApp("arcade"), {}), {});
});

test("demo connectors never report live health", () => {
  for (const app of APPS) assert.equal(healthFor(app), "demo");
});

test("public app data carries no credentials", () => {
  const view = publicApp(findApp("booking"));
  assert.equal(view.credentials, undefined);
  assert.equal(view.config, undefined);
});