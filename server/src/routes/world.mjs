/** World-level public routes: health, the app directory and the B3 house directory. */

import { DEMO_MODE } from "../nervixpay.demo.mjs";
import { APPS, publicApp } from "../apps.mjs";
import { AccessError } from "../entitlement.mjs";
import { createTokenBucket } from "../presence-transport.mjs";
import { listWorldHouses } from "../store/houses.mjs";

/** Per-client budget for the public directory: a page load reads it once. */
export const WORLD_HOUSES_RATE = Object.freeze({ burst: 30, perSecond: 5 });
/** Bound on tracked client addresses; the table starts over when it fills. */
const MAX_TRACKED_CLIENTS = 1000;

const DEFAULT_DEPS = Object.freeze({ listWorldHouses, now: Date.now });

/** The socket address only: forwarded headers are client-controlled. */
const clientKey = (params) => params?.req?.socket?.remoteAddress ?? "unknown";

function createClientLimiter(rate, now) {
  let buckets = new Map();
  return (key) => {
    if (!buckets.has(key) && buckets.size >= MAX_TRACKED_CLIENTS) buckets = new Map();
    if (!buckets.has(key)) buckets.set(key, createTokenBucket(rate, now));
    if (!buckets.get(key).take()) throw new AccessError("too many directory requests, retry shortly", "cap_reached");
  };
}

export function createWorldRoutes(ctx, deps = DEFAULT_DEPS) {
  const { listWorldHouses: list, now = Date.now } = deps;
  const store = () => ctx?.db?.store ?? null;
  const limit = createClientLimiter(WORLD_HOUSES_RATE, now);
  return {
    "GET /health": () => ({ ok: true, demo: DEMO_MODE, uptime: process.uptime() }),

    "GET /apps": () => ({ apps: APPS.map(publicApp) }),

    // Public: doors stand on public streets. No database means no houses (fail closed).
    "GET /world/houses": async (_body, params) => {
      limit(clientKey(params));
      return { houses: store() ? await list(store()) : [] };
    },
  };
}
