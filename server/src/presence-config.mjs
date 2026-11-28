/**
 * Presence settings (split out of presence.mjs before C9): the exported
 * defaults, the real clock, and one frozen settings object built from the
 * attachPresence options, then PRESENCE_* environment settings, then defaults.
 * An option left undefined falls through, exactly as the old destructuring
 * defaults did.
 */
import { parseOrigins } from "./presence-origin.mjs";
import { DEFAULT_MAX_QUEUE, DEFAULT_PLACE_LIMIT } from "./presence-queue.mjs";
import {
  DEFAULT_HEARTBEAT_MS, DEFAULT_MAX_BUFFERED_BYTES, DEFAULT_TICK_MS, presenceSettingsFromEnv,
} from "./presence-transport.mjs";
import { DEFAULT_SAY_ADDRESS_LIMIT, DEFAULT_SAY_LIMIT, DEFAULT_SAY_USER_LIMIT } from "./presence-chat-limits.mjs";

const MAX_PLAYERS = 200;
const MS_PER_SECOND = 1000;

export const DEFAULT_MAX_PAYLOAD = 4 * 1024;
export const DEFAULT_ROOM_CAPACITY = MAX_PLAYERS;
export const DEFAULT_MAX_CONNECTIONS = MAX_PLAYERS * 2;
export const DEFAULT_MOVE_LIMIT = Object.freeze({ burst: 20, perSecond: 20 });
export const DEFAULT_EMOTE_LIMIT = Object.freeze({ burst: 3, perSecond: 1 });
export const DEFAULT_SESSION_RECHECK_MS = 60 * MS_PER_SECOND;

export const REAL_CLOCK = Object.freeze({
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
});

const noSession = async () => null;
const noPreset = async () => null;
const noPrivacy = async () => null;
const logError = (error) => console.error(`presence: ${error?.message ?? error}`);

/** Runs `fn` every `ms` on `clock`; returns the stop function. Real timers never hold the process open. */
export function every(clock, ms, fn) {
  const handle = clock.setInterval(fn, ms);
  handle?.unref?.();
  return () => clock.clearInterval(handle);
}

/** The frozen settings for one attachPresence call. */
export function presenceOptions(options = {}, env = process.env) {
  const fromEnv = presenceSettingsFromEnv(env);
  const pick = (key, fallback) => (options[key] === undefined ? fallback : options[key]);
  return Object.freeze({
    path: pick("path", "/presence"),
    resolveSession: pick("resolveSession", noSession),
    resolvePreset: pick("resolvePreset", noPreset),
    resolvePrivacy: pick("resolvePrivacy", noPrivacy),
    isKnownProperty: options.isKnownProperty,
    onError: pick("onError", logError),
    maxPayload: pick("maxPayload", DEFAULT_MAX_PAYLOAD),
    maxConnections: pick("maxConnections", fromEnv.maxConnections ?? DEFAULT_MAX_CONNECTIONS),
    roomCapacity: pick("roomCapacity", fromEnv.roomCapacity ?? DEFAULT_ROOM_CAPACITY),
    tickMs: pick("tickMs", fromEnv.tickMs ?? DEFAULT_TICK_MS),
    heartbeatMs: pick("heartbeatMs", fromEnv.heartbeatMs ?? DEFAULT_HEARTBEAT_MS),
    maxBufferedBytes: pick("maxBufferedBytes", DEFAULT_MAX_BUFFERED_BYTES),
    clock: pick("clock", REAL_CLOCK),
    placeBounds: pick("placeBounds", {}),
    moveLimit: pick("moveLimit", DEFAULT_MOVE_LIMIT),
    emoteLimit: pick("emoteLimit", DEFAULT_EMOTE_LIMIT),
    placeLimit: pick("placeLimit", DEFAULT_PLACE_LIMIT),
    maxQueue: pick("maxQueue", DEFAULT_MAX_QUEUE),
    sayLimit: pick("sayLimit", DEFAULT_SAY_LIMIT),
    sayUserLimit: pick("sayUserLimit", DEFAULT_SAY_USER_LIMIT),
    sayAddressLimit: pick("sayAddressLimit", DEFAULT_SAY_ADDRESS_LIMIT),
    sessionRecheckMs: pick("sessionRecheckMs", DEFAULT_SESSION_RECHECK_MS),
    allowedOrigins: pick("allowedOrigins", parseOrigins(env.PRESENCE_ALLOWED_ORIGINS)),
  });
}
