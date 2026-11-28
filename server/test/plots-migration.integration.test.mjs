/**
 * B1: migration 017 applied on top of data written before it. Legacy houses
 * become plots, a cross-owner or duplicate merchant binding is dropped (fail
 * closed) instead of aborting the migration, and one catalogue per merchant is bound.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import pg from "pg";

import { pgAvailable, throwawayDbName, databaseUrl, migrationFiles, dropThrowawayDb, MIGRATIONS_DIR, PG_HOST } from "./helpers/db.mjs";

const available = pgAvailable();
const PLOTS_MIGRATION = "017_plots.sql";

const applyFile = (name, file) =>
  execFileSync("psql", ["-h", PG_HOST, "-d", name, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIGRATIONS_DIR, file)], { stdio: "pipe" });

/** A fresh database with every migration before 017, plus `legacy` rows. */
async function beforePlots(legacy) {
  const name = throwawayDbName("nervix_world_b1m");
  execFileSync("createdb", ["-h", PG_HOST, name]);
  const pool = new pg.Pool({ connectionString: databaseUrl(name) });
  for (const file of migrationFiles().filter((f) => f < PLOTS_MIGRATION)) applyFile(name, file);
  await pool.query(legacy);
  return { name, pool };
}

const LEGACY = `
  INSERT INTO districts (id, name) VALUES ('merchant-quarter', 'MQ');
  INSERT INTO users (id, email, display_name) VALUES ('usr_a', 'a@x.invalid', 'A'), ('usr_b', 'b@x.invalid', 'B'), ('usr_c', 'c@x.invalid', 'C');
  INSERT INTO merchants (id, owner_id, business_type, name) VALUES ('mer_a', 'usr_a', 'merchant', 'A'), ('mer_b', 'usr_b', 'merchant', 'B');
  INSERT INTO properties (id, owner_id, merchant_id, slot_id, district, template, address) VALUES
    ('prop_a', 'usr_a', 'mer_a', 'slot-01', 'merchant-quarter', 'merchant_house', 'x'),
    ('prop_b', 'usr_b', 'mer_a', 'slot-20', 'merchant-quarter', 'merchant_house', 'x'),
    ('prop_c', 'usr_c', NULL, 'slot-21', 'merchant-quarter', 'merchant_house', 'x');
  INSERT INTO builders (id, owner_id, name) VALUES ('bld_a1', 'usr_a', 'A1'), ('bld_a2', 'usr_a', 'A2'), ('bld_c', 'usr_c', 'C');
`;

test("017 migrates pre-existing rows and fails closed on bad bindings", { skip: available ? false : "Postgres not reachable at PGHOST" }, async () => {
  const name = throwawayDbName("nervix_world_b1m");
  execFileSync("createdb", ["-h", PG_HOST, name]);
  const pool = new pg.Pool({ connectionString: databaseUrl(name) });
  try {
    for (const file of migrationFiles().filter((f) => f < PLOTS_MIGRATION)) applyFile(name, file);
    await pool.query(LEGACY);
    applyFile(name, PLOTS_MIGRATION);
    const props = (await pool.query("SELECT id, plot_id, merchant_id FROM properties ORDER BY id")).rows;
    assert.deepEqual(props, [
      { id: "prop_a", plot_id: "slot-01", merchant_id: "mer_a" },
      { id: "prop_b", plot_id: "slot-20", merchant_id: null },
      { id: "prop_c", plot_id: "slot-21", merchant_id: null },
    ]);
    const builders = (await pool.query("SELECT id, merchant_id FROM builders ORDER BY id")).rows;
    assert.deepEqual(builders, [
      { id: "bld_a1", merchant_id: "mer_a" },
      { id: "bld_a2", merchant_id: null },
      { id: "bld_c", merchant_id: null },
    ]);
    const plots = (await pool.query("SELECT count(*)::int AS n FROM plots")).rows[0].n;
    assert.equal(plots, 14 + 2);
  } finally {
    await pool.end();
    dropThrowawayDb(name);
  }
});

const skip = available ? false : "Postgres not reachable at PGHOST";

test("017 can be re-applied without error or change", { skip }, async () => {
  const { name, pool } = await beforePlots(LEGACY);
  const snapshot = async () => ({
    props: (await pool.query("SELECT id, plot_id, merchant_id FROM properties ORDER BY id")).rows,
    builders: (await pool.query("SELECT id, merchant_id FROM builders ORDER BY id")).rows,
    plots: (await pool.query("SELECT id, district, template, sort_order FROM plots ORDER BY id")).rows,
  });
  try {
    applyFile(name, PLOTS_MIGRATION);
    const first = await snapshot();
    applyFile(name, PLOTS_MIGRATION);
    assert.deepEqual(await snapshot(), first);
  } finally {
    await pool.end();
    dropThrowawayDb(name);
  }
});

test("017 fails loudly when a legacy house's district disagrees with its seeded plot", { skip }, async () => {
  const { name, pool } = await beforePlots(`
    INSERT INTO districts (id, name) VALUES ('merchant-quarter', 'MQ');
    INSERT INTO users (id, email, display_name) VALUES ('usr_m', 'm@x.invalid', 'M');
    INSERT INTO properties (id, owner_id, slot_id, district, template, address)
      VALUES ('prop_m', 'usr_m', 'cafe-1', 'merchant-quarter', 'merchant_house', 'x');
  `);
  try {
    assert.throws(() => applyFile(name, PLOTS_MIGRATION), (error) => /district/.test(String(error.stderr)));
    const plots = await pool.query("SELECT to_regclass('plots') AS t");
    assert.equal(plots.rows[0].t, null, "the failed migration left no partial schema");
  } finally {
    await pool.end();
    dropThrowawayDb(name);
  }
});
