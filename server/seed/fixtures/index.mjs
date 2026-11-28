/**
 * Slice fixtures, applied in dependency order. Test/demo data only: no real
 * payments, no production records. Idempotent.
 */

import { applyUsers, applySessions } from "./users.mjs";
import { applyDistricts, applyPlots, applyMerchants, applyProperties } from "./merchants.mjs";
import { applyBuilders } from "./builders.mjs";
import { applyOfferings } from "./offerings.mjs";
import { applyDirectoryHouses } from "./directory.mjs";
import { applyAvatars } from "./avatars.mjs";

export { SUBSCRIBERS, SESSIONS, SESSION_OWNERS, USERS } from "./users.mjs";
export { MERCHANTS, PROPERTIES } from "./merchants.mjs";
export { BUILDERS } from "./builders.mjs";
export { OFFERINGS } from "./offerings.mjs";
export { DIRECTORY_HOUSES } from "./directory.mjs";

const STEPS = Object.freeze([applyDistricts, applyPlots, applyUsers, applyAvatars, applyMerchants, applyProperties, applyDirectoryHouses, applyBuilders, applyOfferings, applySessions]);

export async function applySliceFixtures(pool) {
  const q = (sql, args) => pool.query(sql, args);
  for (const step of STEPS) await step(q);
}
