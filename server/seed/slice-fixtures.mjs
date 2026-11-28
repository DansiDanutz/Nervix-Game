/**
 * Fixtures for the first playable slice (plaza → OpenPoker → DanGG → plaza,
 * plus the independent Test Builder house). Test/demo data only: no real
 * payments, no production records. Idempotent. The data and loaders live in
 * seed/fixtures/*.mjs; this file keeps the public exports and the CLI.
 *
 *   DATABASE_URL=postgres:///nervix_world node seed/slice-fixtures.mjs
 *
 * Sessions are only meaningful with NODE_ENV=test and
 * NERVIX_WORLD_TEST_SUBSCRIBER=<SUBSCRIBERS joined by ","> on the server; the
 * real subscription source is not wired and fails closed.
 */

import pg from "pg";
import { applySliceFixtures, SUBSCRIBERS } from "./fixtures/index.mjs";

export { applySliceFixtures, SESSIONS, SUBSCRIBERS } from "./fixtures/index.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  applySliceFixtures(pool)
    .then(() => console.log(`slice fixtures applied; subscribers for NODE_ENV=test: ${SUBSCRIBERS.join(",")}`))
    .catch((e) => {
      console.error("fixture error:", e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
