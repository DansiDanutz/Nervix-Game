// Fixtures domain of the E2E prepare: the server's slice seeder (users,
// merchants, builders, offerings, sessions live in server/seed/fixtures/*).
import { join } from "node:path";
import { databaseUrl } from "./database.mjs";

export function fixtureCommand(db, serverDir, env = process.env) {
  return Object.freeze([
    process.execPath,
    Object.freeze([join(serverDir, "seed", "slice-fixtures.mjs")]),
    Object.freeze({ ...env, DATABASE_URL: databaseUrl(db) }),
  ]);
}
