// Schema domain of the E2E prepare: apply every server migration in order.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SOCKET_HOST } from "./database.mjs";

export function migrationFiles(dir) {
  return Object.freeze(readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f)));
}

export function migrationCommands(db, files) {
  return Object.freeze(files.map((file) =>
    Object.freeze(["psql", Object.freeze(["-h", SOCKET_HOST, "-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-f", file])])));
}
