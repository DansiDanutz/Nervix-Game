/**
 * C8 seed entry point for the fixture walkers (seed/fixtures/walkers.mjs): their
 * fixture users, avatar presets and sessions. Opt-in and DEMO-only: it is not part
 * of applySliceFixtures, and it refuses unless NERVIX_WORLD_SLICE is on, payments
 * are not live and NODE_ENV is not production (the same guard as the walker
 * service). Run it after the slice fixtures, then start scripts/fixture-walkers.mjs:
 *
 *   DATABASE_URL=postgres:///nervix_world node seed/slice-fixtures.mjs
 *   DATABASE_URL=postgres:///nervix_world NERVIX_WORLD_SLICE=1 node seed/walker-fixtures.mjs
 *
 * Idempotent. Fictional demo identities only; they own nothing.
 */

import pg from "pg";
import { applyWalkers, WALKERS } from "./fixtures/walkers.mjs";
import { envRefusal } from "../scripts/fixture-walkers.mjs";

export const SEED_COMMAND = "NERVIX_WORLD_SLICE=1 node seed/walker-fixtures.mjs";

/** Seeds the walkers through `pool.query`; resolves with their display names. Refuses before any query outside DEMO. */
export async function seedWalkerFixtures(pool, env = process.env) {
  const refusal = envRefusal(env);
  if (refusal) throw new Error(`walker fixtures refused: ${refusal}`);
  await applyWalkers((sql, args) => pool.query(sql, args));
  return WALKERS.map((w) => w.name);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    const names = await seedWalkerFixtures(pool);
    console.log(`walker fixtures applied: ${names.join(", ")}`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`walker fixture error: ${e.message}`);
    process.exitCode = 1;
  });
}
