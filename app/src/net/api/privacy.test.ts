import test from "node:test";
import assert from "node:assert/strict";
import type { Call } from "./http.ts";
import { ANON_NAME, DEFAULT_PRIVACY, isNameHidden, parseMyPrivacy, privacyEndpoints, shownAs } from "./privacy.ts";

test("names are visible by default (D10)", () => {
  assert.deepEqual(DEFAULT_PRIVACY, { hideName: false, anonymous: false });
  assert.ok(Object.isFrozen(DEFAULT_PRIVACY));
});

test("parseMyPrivacy keeps real booleans and a known source only", () => {
  assert.deepEqual(parseMyPrivacy({ hideName: true, anonymous: false, source: "saved" }), { hideName: true, anonymous: false, source: "saved" });
  assert.deepEqual(parseMyPrivacy({ hideName: "yes", anonymous: 1, source: "x" }), { hideName: false, anonymous: false, source: "default" });
  assert.deepEqual(parseMyPrivacy(null), { hideName: false, anonymous: false, source: "default" });
});

test("anonymous implies a hidden name, and shownAs is what others see", () => {
  assert.equal(isNameHidden({ hideName: false, anonymous: true }), true);
  assert.equal(isNameHidden(DEFAULT_PRIVACY), false);
  assert.equal(shownAs(DEFAULT_PRIVACY, "DanGG"), "DanGG");
  assert.equal(shownAs({ hideName: true, anonymous: false }, "DanGG"), ANON_NAME);
  assert.equal(ANON_NAME, "Anonymous", "matches the server label");
});

test("privacy endpoints: GET /me/privacy and PUT /me/privacy with the two booleans only (no userId)", async () => {
  const calls: [string, unknown, string | undefined][] = [];
  const call = (async (path: string, body?: unknown, method?: string) => {
    calls.push([path, body, method]);
    return { hideName: true, anonymous: false, source: "saved" };
  }) as Call;
  const p = privacyEndpoints(call);
  assert.deepEqual(await p.myPrivacy(), { hideName: true, anonymous: false, source: "saved" });
  await p.savePrivacy({ hideName: true, anonymous: false });
  assert.deepEqual(calls, [["/me/privacy", undefined, undefined], ["/me/privacy", { hideName: true, anonymous: false }, "PUT"]]);
});
