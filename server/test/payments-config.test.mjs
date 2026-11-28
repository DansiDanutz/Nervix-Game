import test from "node:test";
import assert from "node:assert/strict";

import { liveModeDecision, createPayments, SLICE_FLAG } from "../src/payments-config.mjs";

const TOKENS = Object.freeze({ NERVIXPAY_AGENT_TOKEN: "tok_dummy", NERVIXPAY_BASE_URL: "http://127.0.0.1:9", NERVIXPAY_WEBHOOK_SECRET: "whsec_dummy" });
const LIVE = Object.freeze({ ...TOKENS, NERVIXPAY_MODE: "live", NODE_ENV: "production", [SLICE_FLAG]: "0" });

function fakeFactory() {
  const calls = [];
  return { calls, factory: (cfg) => { calls.push(cfg); return { kind: "live", cfg }; } };
}

test("token env vars alone never build the live adapter", () => {
  const { calls, factory } = fakeFactory();
  assert.equal(createPayments({ ...TOKENS, NODE_ENV: "production", [SLICE_FLAG]: "0" }, { createAdapter: factory }), null);
  assert.equal(calls.length, 0);
  assert.equal(liveModeDecision({ ...TOKENS }).reason, "mode_not_live");
});

test("NODE_ENV=test refuses live mode even with every live setting present", () => {
  const { calls, factory } = fakeFactory();
  const env = { ...LIVE, NODE_ENV: "test" };
  assert.equal(createPayments(env, { createAdapter: factory }), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(liveModeDecision(env), { live: false, reason: "test_env" });
});

test("the slice flag is on by default and refuses live mode", () => {
  const { factory } = fakeFactory();
  const { [SLICE_FLAG]: _omit, ...unset } = LIVE;
  for (const env of [unset, { ...LIVE, [SLICE_FLAG]: "1" }, { ...LIVE, [SLICE_FLAG]: "true" }, { ...LIVE, [SLICE_FLAG]: "" }]) {
    assert.equal(createPayments(env, { createAdapter: factory }), null);
    assert.equal(liveModeDecision(env).reason, "slice");
  }
});

test("live mode without credentials stays demo", () => {
  assert.deepEqual(liveModeDecision({ ...LIVE, NERVIXPAY_AGENT_TOKEN: "" }), { live: false, reason: "not_configured" });
  assert.equal(createPayments({ ...LIVE, NERVIXPAY_BASE_URL: "" }, { createAdapter: fakeFactory().factory }), null);
});

test("only the explicit live configuration builds the adapter", () => {
  const { calls, factory } = fakeFactory();
  assert.deepEqual(liveModeDecision(LIVE), { live: true, reason: "live" });
  const adapter = createPayments(LIVE, { createAdapter: factory });
  assert.equal(adapter.kind, "live");
  assert.deepEqual(calls, [{ baseUrl: TOKENS.NERVIXPAY_BASE_URL, agentToken: TOKENS.NERVIXPAY_AGENT_TOKEN, webhookSecret: TOKENS.NERVIXPAY_WEBHOOK_SECRET }]);
});

test("mode matching is exact and case-insensitive only for the word live", () => {
  assert.equal(liveModeDecision({ ...LIVE, NERVIXPAY_MODE: "LIVE" }).live, true);
  assert.equal(liveModeDecision({ ...LIVE, NERVIXPAY_MODE: "live-ish" }).live, false);
  assert.equal(liveModeDecision({ ...LIVE, NERVIXPAY_MODE: "demo" }).live, false);
});

test("an empty or missing env is demo", () => {
  assert.equal(createPayments({}), null);
  assert.equal(createPayments(undefined), null);
});
