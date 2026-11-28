// Fresh throwaway database for every E2E run: migrations + slice fixtures only.
// Runs before Playwright because webServer starts before globalSetup.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DB = "nervix_world_slice_e2e";
const HOST = "/tmp";
const server = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "server");

execFileSync("dropdb", ["-h", HOST, "--if-exists", "--force", DB]);
execFileSync("createdb", ["-h", HOST, DB]);
const dir = join(server, "db", "migrations");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  execFileSync("psql", ["-h", HOST, "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(dir, f)], { stdio: "pipe" });
}
execFileSync(process.execPath, [join(server, "seed", "slice-fixtures.mjs")], {
  env: { ...process.env, DATABASE_URL: `postgres:///${DB}?host=${encodeURIComponent(HOST)}` },
  stdio: "inherit",
});
