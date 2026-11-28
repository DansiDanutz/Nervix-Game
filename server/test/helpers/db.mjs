/**
 * Throwaway Postgres databases for integration tests (local socket only).
 * Each database is uniquely named, gets every migration, and is dropped by the
 * caller. The development database is never touched.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, "..", "..", "db", "migrations");
export const PG_HOST = process.env.PGHOST ?? "/tmp";

export function pgAvailable(host = PG_HOST) {
  try {
    execFileSync("psql", ["-h", host, "-d", "postgres", "-Atc", "select 1"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function throwawayDbName(prefix = "nervix_world_t") {
  const safe = String(prefix).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return `${safe}_${process.pid}_${Date.now().toString(36)}`;
}

export function databaseUrl(name, host = PG_HOST) {
  return `postgres:///${name}?host=${encodeURIComponent(host)}`;
}

export function migrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

/** Creates a uniquely named database with every migration applied. */
export function createThrowawayDb({ prefix, host = PG_HOST } = {}) {
  const name = throwawayDbName(prefix);
  execFileSync("createdb", ["-h", host, name]);
  try {
    for (const file of migrationFiles()) {
      execFileSync("psql", ["-h", host, "-d", name, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIGRATIONS_DIR, file)], { stdio: "pipe" });
    }
  } catch (error) {
    dropThrowawayDb(name, host);
    throw error;
  }
  return Object.freeze({ name, url: databaseUrl(name, host), drop: () => dropThrowawayDb(name, host) });
}

export function dropThrowawayDb(name, host = PG_HOST) {
  execFileSync("dropdb", ["-h", host, "--if-exists", "--force", name]);
}
