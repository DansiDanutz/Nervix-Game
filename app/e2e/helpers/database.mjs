// Database domain of the E2E prepare: recreate one throwaway database.
import { isThrowawayDb } from "../ports.ts";

/** Local Postgres socket directory used by every E2E run. */
export const SOCKET_HOST = "/tmp";

export function databaseUrl(db) {
  return `postgres:///${db}?host=${encodeURIComponent(SOCKET_HOST)}`;
}

/** dropdb + createdb, refused for anything but a throwaway *_e2e* name. */
export function recreateCommands(db) {
  if (!isThrowawayDb(db)) throw new Error(`refusing to recreate ${JSON.stringify(db)}: not a throwaway *_e2e* database`);
  return Object.freeze([
    Object.freeze(["dropdb", Object.freeze(["-h", SOCKET_HOST, "--if-exists", "--force", db])]),
    Object.freeze(["createdb", Object.freeze(["-h", SOCKET_HOST, db])]),
  ]);
}
