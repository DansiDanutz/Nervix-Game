/**
 * E2E ports and database, configurable per run so two runs never collide:
 * E2E_API_PORT, E2E_WEB_PORT, E2E_DB. Defaults are the shared slice values.
 * Erasable TypeScript only, so plain `node` (prepare-db.mjs) can import it too.
 */
export interface E2eConfig {
  readonly apiPort: number;
  readonly webPort: number;
  readonly db: string;
}

export const DEFAULT_E2E: E2eConfig = Object.freeze({ apiPort: 28797, webPort: 25183, db: "nervix_world_slice_e2e" });

/** Ports owned by other services on this machine: never use them. */
const PEER_PORTS: readonly number[] = Object.freeze([8787, 18787]);
const MIN_PORT = 1024;
const MAX_PORT = 65535;
/** prepare-db drops this database, so it must be a throwaway *_e2e* name. */
const SAFE_DB = /^[a-z][a-z0-9_]*_e2e(_[a-z0-9_]*)?$/;

type Env = Readonly<Record<string, string | undefined>>;

function port(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(`${name} must be an integer port in ${MIN_PORT}-${MAX_PORT}, got ${JSON.stringify(raw)}`);
  }
  if (PEER_PORTS.includes(value)) throw new Error(`${name} ${value} belongs to another service`);
  return value;
}

/** True only for a lower-case throwaway database name containing _e2e (safe to drop). */
export function isThrowawayDb(name: unknown): name is string {
  return typeof name === "string" && SAFE_DB.test(name);
}

function database(env: Env): string {
  const raw = env.E2E_DB;
  if (raw === undefined || raw === "") return DEFAULT_E2E.db;
  if (!isThrowawayDb(raw)) throw new Error(`E2E_DB must be a lower-case throwaway name containing _e2e, got ${JSON.stringify(raw)}`);
  return raw;
}

export function e2ePorts(env: Env = process.env): E2eConfig {
  const apiPort = port(env, "E2E_API_PORT", DEFAULT_E2E.apiPort);
  const webPort = port(env, "E2E_WEB_PORT", DEFAULT_E2E.webPort);
  if (apiPort === webPort) throw new Error(`E2E_API_PORT and E2E_WEB_PORT must differ (both ${apiPort})`);
  return Object.freeze({ apiPort, webPort, db: database(env) });
}
