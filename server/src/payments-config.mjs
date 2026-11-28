/**
 * Decides whether the live NervixPay adapter may exist in this process.
 *
 * Fail closed: the live adapter is built only when every one of these holds:
 *   - NERVIXPAY_MODE is exactly "live" (any case),
 *   - NODE_ENV is not "test",
 *   - the slice flag (NERVIX_WORLD_SLICE) is explicitly off ("0", "false" or "off"),
 *   - NERVIXPAY_AGENT_TOKEN and NERVIXPAY_BASE_URL are both set.
 * Token env vars on their own never switch live mode on, so the slice and the
 * test runs always use the demo adapter.
 */

import { createLiveAdapter } from "./nervixpay.live.mjs";

export const SLICE_FLAG = "NERVIX_WORLD_SLICE";
const SLICE_OFF_VALUES = Object.freeze(["0", "false", "off"]);

function sliceIsOn(env) {
  return !SLICE_OFF_VALUES.includes(String(env[SLICE_FLAG] ?? "").trim().toLowerCase());
}

/** Pure decision with the reason live mode was refused (for logs and tests). */
export function liveModeDecision(env = {}) {
  const e = env ?? {};
  if (String(e.NERVIXPAY_MODE ?? "").trim().toLowerCase() !== "live") return Object.freeze({ live: false, reason: "mode_not_live" });
  if (e.NODE_ENV === "test") return Object.freeze({ live: false, reason: "test_env" });
  if (sliceIsOn(e)) return Object.freeze({ live: false, reason: "slice" });
  if (!e.NERVIXPAY_AGENT_TOKEN || !e.NERVIXPAY_BASE_URL) return Object.freeze({ live: false, reason: "not_configured" });
  return Object.freeze({ live: true, reason: "live" });
}

export function livePaymentsAllowed(env) {
  return liveModeDecision(env).live;
}

/** The live adapter, or null for demo mode. `createAdapter` is injectable for tests. */
export function createPayments(env, { createAdapter = createLiveAdapter } = {}) {
  if (!livePaymentsAllowed(env)) return null;
  return createAdapter({ baseUrl: env.NERVIXPAY_BASE_URL, agentToken: env.NERVIXPAY_AGENT_TOKEN, webhookSecret: env.NERVIXPAY_WEBHOOK_SECRET });
}
