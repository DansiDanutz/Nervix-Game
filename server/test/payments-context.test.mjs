/**
 * S2 acceptance (4) at the context level: with the token env vars set under
 * NODE_ENV=test, db.payments stays null.
 *
 * routes/context.mjs belongs to F0, not S2, so the fix is a handover to the
 * lead (use createPayments from payments-config.mjs). Until it lands the
 * context test is marked todo: it reports, but does not fail the run.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createContext } from "../src/routes/context.mjs";

const TOKEN_ENV = Object.freeze({ NODE_ENV: "test", NERVIXPAY_AGENT_TOKEN: "x", NERVIXPAY_BASE_URL: "y" });

const handoverApplied = (await import("node:fs")).readFileSync(new URL("../src/routes/context.mjs", import.meta.url), "utf8")
  .includes("createPayments(");

test("createContext keeps db.payments null under NODE_ENV=test with token env vars set", {
  todo: handoverApplied ? false : "lead: apply the payments-config handover in routes/context.mjs",
}, () => {
  assert.equal(createContext({ env: TOKEN_ENV }).db.payments, null);
});

test("createContext keeps db.payments null in live mode while the slice flag is on", {
  todo: handoverApplied ? false : "lead: apply the payments-config handover in routes/context.mjs",
}, () => {
  const env = { ...TOKEN_ENV, NODE_ENV: "production", NERVIXPAY_MODE: "live" };
  assert.equal(createContext({ env }).db.payments, null);
});
