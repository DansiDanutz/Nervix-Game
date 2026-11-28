// The E2E prepare as an ordered, immutable plan: database → schema → fixtures.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { e2ePorts } from "../ports.ts";
import { recreateCommands } from "./database.mjs";
import { migrationFiles, migrationCommands } from "./schema.mjs";
import { fixtureCommand } from "./fixtures.mjs";

const step = (domain, command) => Object.freeze({ domain, command });

export function preparePlan(env, serverDir, listMigrations = migrationFiles) {
  const { db } = e2ePorts(env);
  const files = listMigrations(join(serverDir, "db", "migrations"));
  return Object.freeze([
    ...recreateCommands(db).map((c) => step("database", c)),
    ...migrationCommands(db, files).map((c) => step("schema", c)),
    step("fixtures", fixtureCommand(db, serverDir, env)),
  ]);
}

export function runPlan(plan) {
  for (const { domain, command: [cmd, args, env] } of plan) {
    execFileSync(cmd, args, { env, stdio: domain === "fixtures" ? "inherit" : "pipe" });
  }
}
