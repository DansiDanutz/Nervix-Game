/**
 * Slice fixtures, applied in dependency order. Test/demo data only: no real
 * payments, no production records. Idempotent.
 */

import { applyUsers, applySessions } from "./users.mjs";
import { applyDistricts, applyMerchants, applyProperties } from "./merchants.mjs";
import { applyBuilders, applyOfferings } from "./builders.mjs";

export { SUBSCRIBERS, SESSIONS, SESSION_OWNERS, USERS } from "./users.mjs";
export { MERCHANTS, PROPERTIES } from "./merchants.mjs";
export { BUILDERS, OFFERINGS } from "./builders.mjs";

const STEPS = Object.freeze([applyDistricts, applyUsers, applyMerchants, applyProperties, applyBuilders, applyOfferings, applySessions]);

export async function applySliceFixtures(pool) {
  const q = (sql, args) => pool.query(sql, args);
  for (const step of STEPS) await step(q);
}
