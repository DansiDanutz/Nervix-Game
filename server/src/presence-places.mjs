/**
 * Place and appearance rules for presence rooms (C3). Pure functions, no I/O
 * beyond reading the two frozen contracts once at load.
 *
 * A place id is valid when it is in shared/contracts/place-ids.json, or when it
 * is a well-formed property id (prop_*) that the store knows. Each place has
 * its own bounds: the plaza, the OpenPoker salon and the house room box (all
 * house interiors share one room size today).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const loadContract = (name) => JSON.parse(readFileSync(new URL(`../../shared/contracts/${name}.json`, import.meta.url), "utf8"));

export const CONTRACT_PLACE_IDS = Object.freeze(loadContract("place-ids").places.map((p) => p.id));
export const PRESET_IDS = Object.freeze(loadContract("avatar-presets").presets.map((p) => p.id));
export const DEFAULT_PLACE = "plaza";

const PROPERTY_ID = /^prop_[a-z0-9_]{1,40}$/;
const TWO_PI = Math.PI * 2;
const HOUSE = "house";

const box = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });

/**
 * Server-side clamps, a little looser than the client walk bounds: the plaza
 * covers the Blender square (x -42..34, z -13..13) and the legacy blockout
 * (±38); the salon and the house room match the client boxes.
 */
export const DEFAULT_PLACE_BOUNDS = Object.freeze({
  plaza: box(-42, 40, -40, 40),
  openpoker: box(-6.9, 6.9, -8.9, 6.9),
  [HOUSE]: box(-5.6, 5.6, -4.2, 4.2),
});

const noop = () => {};

/** How long a property lookup (hit or miss) is trusted; errors are never cached. */
export const PROPERTY_LOOKUP_TTL_MS = 30_000;
const PROPERTY_CACHE_MAX = 500;

/** Is `value` shaped like a place id (contract id or prop_*)? Says nothing about whether it exists. */
export const isPlaceShaped = (value) => typeof value === "string" && (CONTRACT_PLACE_IDS.includes(value) || PROPERTY_ID.test(value));

/** A small TTL cache of property lookups, oldest entry evicted first when full. */
function createLookupCache(now) {
  const entries = new Map(); // id -> { known, at }
  return Object.freeze({
    get(id) {
      const hit = entries.get(id);
      if (!hit) return undefined;
      if (now() - hit.at > PROPERTY_LOOKUP_TTL_MS) {
        entries.delete(id);
        return undefined;
      }
      return hit.known;
    },
    set(id, known) {
      entries.delete(id);
      if (entries.size >= PROPERTY_CACHE_MAX) entries.delete(entries.keys().next().value);
      entries.set(id, Object.freeze({ known, at: now() }));
    },
  });
}

/** async (value) => the place id, or null when it is not a known place. Never throws. */
export function createPlaceValidator({ isKnownProperty = async () => false, onError = noop, now = Date.now } = {}) {
  const cache = createLookupCache(now);
  const known = async (id) => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const answer = (await isKnownProperty(id)) === true;
    cache.set(id, answer);
    return answer;
  };
  return async (value) => {
    if (typeof value !== "string") return null;
    if (CONTRACT_PLACE_IDS.includes(value)) return value;
    if (!PROPERTY_ID.test(value)) return null;
    try {
      return (await known(value)) ? value : null;
    } catch (error) {
      onError(new Error(`property lookup failed (${error?.message ?? error}); place rejected`));
      return null;
    }
  };
}

/** The bounds of one place. Houses without their own entry use the house room box. */
export function boundsFor(placeId, overrides = {}) {
  const table = { ...DEFAULT_PLACE_BOUNDS, ...overrides };
  if (table[placeId]) return table[placeId];
  return placeId.startsWith("prop_") ? table[HOUSE] : table[DEFAULT_PLACE];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function clampTo(bounds, x, z) {
  return { x: clamp(x, bounds.minX, bounds.maxX), z: clamp(z, bounds.minZ, bounds.maxZ) };
}

/** Yaw in (-pi, pi]; anything non-finite keeps the previous yaw. */
export function normalizeYaw(value, previous) {
  if (typeof value !== "number" || !Number.isFinite(value)) return previous;
  if (value > -Math.PI && value <= Math.PI) return value; // exact, no float drift
  const wrapped = ((((value + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Is `seq` a valid sequence number newer than `last`? */
export function isNewerSeq(seq, last) {
  return Number.isSafeInteger(seq) && seq >= 0 && seq > last;
}

/** A contract preset picked from a hash of `seed` (user id, or handle for guests). */
export function defaultPreset(seed) {
  const digest = createHash("sha256").update(String(seed)).digest();
  return PRESET_IDS[digest.readUInt32BE(0) % PRESET_IDS.length];
}

export function presetOrDefault(stored, seed) {
  return typeof stored === "string" && PRESET_IDS.includes(stored) ? stored : defaultPreset(seed);
}
