import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databaseUrl, recreateCommands, SOCKET_HOST } from "./database.mjs";
import { migrationFiles, migrationCommands } from "./schema.mjs";
import { fixtureCommand } from "./fixtures.mjs";
import { preparePlan } from "./prepare.mjs";

test("databaseUrl points at the throwaway database over the local socket", () => {
  assert.equal(SOCKET_HOST, "/tmp");
  assert.equal(databaseUrl("nervix_world_e2e_f1"), "postgres:///nervix_world_e2e_f1?host=%2Ftmp");
});

test("recreateCommands drops then creates only the named throwaway database", () => {
  assert.deepEqual(recreateCommands("nervix_world_slice_e2e"), [
    ["dropdb", ["-h", "/tmp", "--if-exists", "--force", "nervix_world_slice_e2e"]],
    ["createdb", ["-h", "/tmp", "nervix_world_slice_e2e"]],
  ]);
});

test("recreateCommands refuses a database that is not a throwaway *_e2e* name", () => {
  for (const bad of ["nervix_world", "postgres", "x;drop", ""]) {
    assert.throws(() => recreateCommands(bad), /throwaway/);
  }
});

test("migrationFiles lists only .sql files in lexical order", () => {
  const dir = mkdtempSync(join(tmpdir(), "f1-mig-"));
  for (const f of ["010_b.sql", "002_a.sql", "README.md", "017_c.sql"]) writeFileSync(join(dir, f), "");
  assert.deepEqual(migrationFiles(dir), ["002_a.sql", "010_b.sql", "017_c.sql"].map((f) => join(dir, f)));
});

test("migrationCommands runs each file with ON_ERROR_STOP against the database", () => {
  assert.deepEqual(migrationCommands("a_e2e", ["/m/001.sql", "/m/002.sql"]), [
    ["psql", ["-h", "/tmp", "-d", "a_e2e", "-v", "ON_ERROR_STOP=1", "-q", "-f", "/m/001.sql"]],
    ["psql", ["-h", "/tmp", "-d", "a_e2e", "-v", "ON_ERROR_STOP=1", "-q", "-f", "/m/002.sql"]],
  ]);
});

test("fixtureCommand runs the server slice seeder with the throwaway DATABASE_URL", () => {
  const [cmd, args, env] = fixtureCommand("a_e2e", "/srv", { PATH: "/bin" });
  assert.equal(cmd, process.execPath);
  assert.deepEqual(args, ["/srv/seed/slice-fixtures.mjs"]);
  assert.deepEqual(env, { PATH: "/bin", DATABASE_URL: "postgres:///a_e2e?host=%2Ftmp" });
});

test("preparePlan orders database, schema, then fixtures and reads E2E_DB", () => {
  const listMigrations = () => ["/srv/db/migrations/001.sql"];
  assert.throws(() => preparePlan({ E2E_DB: "prod" }, "/srv", listMigrations), /E2E_DB/);
  const plan = preparePlan({ E2E_DB: "nervix_world_e2e_f1" }, "/srv", listMigrations);
  assert.deepEqual(plan.map((s) => s.domain), ["database", "database", "schema", "fixtures"]);
  assert.equal(plan.at(-1).command[2].DATABASE_URL, "postgres:///nervix_world_e2e_f1?host=%2Ftmp");
  assert.equal(Object.isFrozen(plan), true);
});

test("preparePlan defaults to the shared slice database", () => {
  const plan = preparePlan({}, "/srv", () => []);
  assert.deepEqual(plan[0].command[1].at(-1), "nervix_world_slice_e2e");
});
