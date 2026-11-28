/**
 * Shared presence, one room per place (C3).
 *
 * Public presence only: an opaque handle, a display name, the place, a
 * position, yaw, the last move sequence and the avatar preset id. Merchant
 * conversations are never broadcast here.
 *
 * Identity is session-bound (S4). On `join` the server reads the
 * `nervix_session` cookie of the upgrade request through `resolveSession(req)`,
 * which returns the session user ({ id, displayName }) or null. Without a
 * session the player is a guest. Anything the client claims in `join` (userId,
 * id, name) is ignored. Every connection gets its own random handle, so user
 * ids (`usr_*`, `demo_*`) never reach another player. A signed-in socket is
 * re-checked periodically and closed once its session ends.
 *
 * Places (C3): `join` and `place` frames carry a place id, validated against
 * shared/contracts/place-ids.json and the known properties
 * (`isKnownProperty`, prop_* from the store). An unknown place is rejected.
 * A refused place change fails closed: the player is parked in no room (others
 * see them leave) and the error names the place. Place frames and joins are
 * rate-limited per socket and the per-socket work queue is capped.
 * Snapshots, moves and emotes stay inside one place's room; each place has its
 * own bounds and capacity. Moves carry yaw and a sequence number; a stale
 * sequence, or a move stamped for another place, is dropped.
 *
 * Transport (C4): room changes are batched and sent on a fixed tick (10 Hz by
 * default) as one `delta` per room: `players` holds the public view of every
 * player who joined or changed since the last tick, `left` the handles that
 * went. A new or moving-in player gets the whole room at once (`welcome`, or
 * `players` after a place change). Sockets are pinged every heartbeat and one
 * that shows no sign of life for a whole heartbeat is terminated. Capacity and
 * timing come from options, or from PRESENCE_* environment settings. A stalled reader past `maxBufferedBytes` is dropped.
 *
 * Chat (CT3): a `say` is cleaned, capped and moderated (presence-chat.mjs),
 * rate-limited per socket (spent as the frame arrives, so a slow join cannot
 * queue a flood) and per signed-in user or guest address
 * (presence-chat-limits.mjs), then sent once to the sender's room as `say`; a
 * refused line gets `say-rejected` with a reason. Nothing is retained.
 *
 * Abuse bounds: small frames (maxPayload), a cap on open sockets, an Origin
 * allow-list on the upgrade, per-socket move/emote token buckets, and no
 * session lookup before a join. One bad frame can never take the process down.
 */

import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  DEFAULT_PLACE, boundsFor, clampTo, createPlaceValidator, isNewerSeq, isPlaceShaped, normalizeYaw,
} from "./presence-places.mjs";
import { GUEST_NAME, connectionIdentity, connectionPreset } from "./presence-identity.mjs";
import { originAllowed, parseOrigins } from "./presence-origin.mjs";
import { DEFAULT_MAX_QUEUE, DEFAULT_PLACE_LIMIT, createWorkQueue } from "./presence-queue.mjs";
import {
  DEFAULT_HEARTBEAT_MS, DEFAULT_MAX_BUFFERED_BYTES, DEFAULT_TICK_MS,
  createLiveness, createRoomBatcher, createTokenBucket, deliver, presenceSettingsFromEnv,
} from "./presence-transport.mjs";
import { moderateSay, sayFrame } from "./presence-chat.mjs";
import { DEFAULT_SAY_ADDRESS_LIMIT, DEFAULT_SAY_LIMIT, DEFAULT_SAY_USER_LIMIT, createSayLimits } from "./presence-chat-limits.mjs";

const MAX_PLAYERS = 200;
const HANDLE_BYTES = 6;
const DEFAULT_DISTRICT = "central-plaza";
const DEFAULT_EMOTE = "wave";
const OPEN = 1;
const CLOSE_TRY_AGAIN_LATER = 1013;
const CLOSE_INTERNAL_ERROR = 1011;
const CLOSE_POLICY_VIOLATION = 1008;
const CLOSE_SESSION_ENDED = 4001;
const HTTP_FORBIDDEN = 403;
const MS_PER_SECOND = 1000;
const REAL_CLOCK = Object.freeze({
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
});

export { GUEST_NAME };
export const HANDLE_PATTERN = /^p_[0-9a-f]{12}$/;
export const DEFAULT_MAX_PAYLOAD = 4 * 1024;
export const DEFAULT_ROOM_CAPACITY = MAX_PLAYERS;
export const DEFAULT_MAX_CONNECTIONS = MAX_PLAYERS * 2;
export const DEFAULT_MOVE_LIMIT = Object.freeze({ burst: 20, perSecond: 20 });
export const DEFAULT_EMOTE_LIMIT = Object.freeze({ burst: 3, perSecond: 1 });
export const DEFAULT_SESSION_RECHECK_MS = 60 * MS_PER_SECOND;
export { DEFAULT_MAX_QUEUE, DEFAULT_PLACE_LIMIT, originAllowed };

// Lowercase slugs only: no underscore, so an id like usr_x cannot be echoed.
const DISTRICT_SLUG = /^[a-z][a-z0-9-]{0,39}$/;
const EMOTE_SLUG = /^[a-z][a-z0-9-]{0,19}$/;

const newHandle = () => `p_${randomBytes(HANDLE_BYTES).toString("hex")}`;
const slugOr = (value, pattern, fallback) => (typeof value === "string" && pattern.test(value) ? value : fallback);
const finiteOr = (value, fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const noSession = async () => null;
const noPreset = async () => null;
const logError = (error) => console.error(`presence: ${error?.message ?? error}`);

/** The refused place, echoed back to its sender only when it is place-shaped (never a user id). */
const refusal = (message, requested) => ({ message, place: isPlaceShaped(requested) ? requested : null });

/** Runs `fn` every `ms` on `clock`; returns the stop function. Real timers never hold the process open. */
function every(clock, ms, fn) {
  const handle = clock.setInterval(fn, ms);
  handle?.unref?.();
  return () => clock.clearInterval(handle);
}

/** Public view of a player record: the handle, never the user id. */
const publicView = ({ handle, name, district, place, preset, x, z, yaw, seq }) =>
  ({ id: handle, name, district, place, preset, x, z, yaw, seq });

export function attachPresence(server, options = {}) {
  const fromEnv = presenceSettingsFromEnv(process.env);
  const {
    path = "/presence",
    resolveSession = noSession,
    resolvePreset = noPreset,
    isKnownProperty,
    onError = logError,
    maxPayload = DEFAULT_MAX_PAYLOAD,
    maxConnections = fromEnv.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
    roomCapacity = fromEnv.roomCapacity ?? DEFAULT_ROOM_CAPACITY,
    tickMs = fromEnv.tickMs ?? DEFAULT_TICK_MS,
    heartbeatMs = fromEnv.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
    maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES,
    clock = REAL_CLOCK,
    placeBounds = {},
    moveLimit = DEFAULT_MOVE_LIMIT,
    emoteLimit = DEFAULT_EMOTE_LIMIT,
    placeLimit = DEFAULT_PLACE_LIMIT,
    maxQueue = DEFAULT_MAX_QUEUE,
    sayLimit = DEFAULT_SAY_LIMIT,
    sayUserLimit = DEFAULT_SAY_USER_LIMIT,
    sayAddressLimit = DEFAULT_SAY_ADDRESS_LIMIT,
    sessionRecheckMs = DEFAULT_SESSION_RECHECK_MS,
    allowedOrigins = parseOrigins(process.env.PRESENCE_ALLOWED_ORIGINS),
  } = options;

  const verifyClient = ({ req }, done) => (originAllowed(req, allowedOrigins) ? done(true) : done(false, HTTP_FORBIDDEN));
  const wss = new WebSocketServer({ server, path, maxPayload, verifyClient });
  const players = new Map(); // ws -> record (userId stays server-side)
  const validatePlace = createPlaceValidator({ isKnownProperty, onError, now: clock.now });
  const batch = createRoomBatcher();
  const liveness = createLiveness();
  const sharedSays = createSayLimits({ perUser: sayUserLimit, perAddress: sayAddressLimit }, clock.now);
  let tick = 0;

  const send = (ws, type, payload = {}) => deliver(ws, JSON.stringify({ type, ...payload }), maxBufferedBytes);

  const roomOf = (place) => [...players.values()].filter((r) => r.place === place).map(publicView);
  const roomSize = (place) => [...players.values()].filter((r) => r.place === place).length;

  /** Sends one frame to every joined socket in `place`, and nobody else. */
  const broadcastRoom = (place, type, payload = {}) => {
    const data = JSON.stringify({ type, ...payload });
    for (const [client, record] of players) {
      if (record.place === place) deliver(client, data, maxBufferedBytes);
    }
  };

  /** One tick: a delta per room that changed, built from the players' current records. */
  const flush = () => {
    tick += 1;
    for (const { place, changed, left } of batch.drain()) {
      const members = [...players.values()].filter((r) => r.place === place);
      const present = new Set(members.map((r) => r.handle));
      const touched = new Set(changed);
      const upserts = members.filter((r) => touched.has(r.handle)).map(publicView);
      const gone = left.filter((handle) => !present.has(handle));
      if (upserts.length > 0 || gone.length > 0) broadcastRoom(place, "delta", { place, tick, players: upserts, left: gone });
    }
  };

  /** Terminates sockets silent for a whole heartbeat; pings the rest. */
  const heartbeat = () => {
    const { evict, ping } = liveness.sweep(wss.clients);
    for (const ws of evict) ws.terminate();
    for (const ws of ping) if (ws.readyState === OPEN) ws.ping();
  };

  const stopTick = every(clock, tickMs, () => {
    try {
      flush();
      sharedSays.sweep();
    } catch (error) {
      onError(error);
    }
  });
  const stopHeartbeat = heartbeatMs > 0 ? every(clock, heartbeatMs, heartbeat) : () => {};
  const stopTimers = () => {
    stopTick();
    stopHeartbeat();
  };
  wss.on("close", stopTimers);
  server.on?.("close", stopTimers);

  const leave = (ws) => {
    liveness.forget(ws);
    const record = players.get(ws);
    if (players.delete(ws) && record.place) batch.leave(record.place, record.handle);
  };

  /** Closes a signed-in socket once its session no longer resolves to the same user. */
  const watchSession = (ws, req, userId) => {
    if (!userId || !(sessionRecheckMs > 0)) return () => {};
    return every(clock, sessionRecheckMs, async () => {
      try {
        const user = await resolveSession(req);
        if (user?.id !== userId) ws.close(CLOSE_SESSION_ENDED, "session ended");
      } catch (error) {
        onError(new Error(`session recheck failed (${error?.message ?? error}); keeping the socket`));
      }
    });
  };

  /** The place a client asked for: the default when absent, null when unknown. */
  const requestedPlace = (message) => (message.place === undefined ? DEFAULT_PLACE : validatePlace(message.place));

  wss.on("connection", (ws, req) => {
    if (wss.clients.size > maxConnections) return ws.close(CLOSE_TRY_AGAIN_LATER, "server busy");

    const moves = createTokenBucket(moveLimit, clock.now);
    const emotes = createTokenBucket(emoteLimit, clock.now);
    const says = createTokenBucket(sayLimit, clock.now);
    const placeChanges = createTokenBucket(placeLimit, clock.now);
    const joins = createTokenBucket(placeLimit, clock.now);
    const address = req.socket?.remoteAddress ?? "unknown";
    let identity = null; // resolved once, on the first join
    let stopWatch = () => {};

    const fail = (error) => {
      onError(error);
      ws.close(CLOSE_INTERNAL_ERROR, "internal error");
    };
    // Joins, place changes and chat run one at a time; a backed-up socket is closed.
    const queue = createWorkQueue({
      maxDepth: maxQueue,
      onFailure: fail,
      onOverflow: (depth) => {
        onError(new Error(`presence queue over ${depth} pending tasks; closing the socket`));
        ws.close(CLOSE_POLICY_VIOLATION, "too many pending requests");
      },
    });
    const enqueue = (task) => queue.push(task);

    const join = async (message) => {
      if (players.has(ws)) return;
      const place = await requestedPlace(message);
      if (!place) return send(ws, "error", refusal("unknown place", message.place));
      identity ??= connectionIdentity(req, resolveSession, onError);
      const { userId, name } = await identity;
      if (ws.readyState !== OPEN || players.has(ws)) return;
      if (roomSize(place) >= roomCapacity) return send(ws, "error", { message: "room full" });
      const handle = newHandle();
      const preset = await connectionPreset(userId, handle, resolvePreset, onError);
      if (ws.readyState !== OPEN) return;
      // Re-checked after the last await: concurrent joins may have filled the room.
      if (roomSize(place) >= roomCapacity) return send(ws, "error", { message: "room full" });
      const record = Object.freeze({
        handle, userId, name, preset, place,
        district: slugOr(message.district, DISTRICT_SLUG, DEFAULT_DISTRICT),
        x: 0, z: 0, yaw: 0, seq: 0,
      });
      players.set(ws, record);
      batch.touch(place, handle);
      stopWatch = watchSession(ws, req, userId);
      return send(ws, "welcome", { id: handle, place, players: roomOf(place) });
    };

    /** Takes the player out of every room (place null) until a valid place frame. Others see them leave. */
    const park = () => {
      const self = players.get(ws);
      if (!self?.place) return;
      players.set(ws, Object.freeze({ ...self, place: null }));
      batch.leave(self.place, self.handle);
    };

    /** A refused place change fails closed: the client has already left the old room, so the server does too. */
    const refuse = (reason, requested) => {
      park();
      send(ws, "error", refusal(reason, requested));
    };

    const changePlace = async (message) => {
      if (!players.has(ws)) return;
      if (message.place === null) return park();
      const place = await validatePlace(message.place);
      const self = players.get(ws);
      if (!self) return;
      if (!place) return refuse("unknown place", message.place);
      if (place === self.place) return;
      if (roomSize(place) >= roomCapacity) return refuse("room full", place);
      const from = self.place;
      const at = clampTo(boundsFor(place, placeBounds), finiteOr(message.x, 0), finiteOr(message.z, 0));
      players.set(ws, Object.freeze({ ...self, place, ...at }));
      if (from) batch.leave(from, self.handle);
      batch.touch(place, self.handle);
      send(ws, "players", { place, players: roomOf(place) });
    };

    const move = (self, message) => {
      const x = Number(message.x);
      const z = Number(message.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (message.place !== undefined && message.place !== self.place) return; // sent before a place change
      if (message.seq !== undefined && !isNewerSeq(message.seq, self.seq)) return;
      if (!moves.take()) return;
      players.set(ws, Object.freeze({
        ...self,
        ...clampTo(boundsFor(self.place, placeBounds), x, z),
        yaw: normalizeYaw(message.yaw, self.yaw),
        seq: message.seq ?? self.seq,
        district: slugOr(message.district, DISTRICT_SLUG, self.district),
      }));
      batch.touch(self.place, self.handle);
    };

    const emote = (self, message) => {
      if (!emotes.take()) return;
      broadcastRoom(self.place, "emote", { id: self.handle, emote: slugOr(message.emote, EMOTE_SLUG, DEFAULT_EMOTE) });
    };

    /**
     * CT3: one line to this room only, queued behind joins and place changes so
     * it never lands in the room just left. The socket token was spent when the
     * frame arrived (sayArrived); here the user or address token is spent
     * before anything else, so every attempt costs both, a wrong-place line
     * included. The text is never kept.
     */
    const say = (message) => {
      const self = players.get(ws);
      if (!self) return;
      if (!self.place) return send(ws, "say-rejected", { reason: "wrong place" });
      if (!sharedSays.take(self, address)) return send(ws, "say-rejected", { reason: "rate limited" });
      if (message.place !== undefined && message.place !== self.place) return send(ws, "say-rejected", { reason: "wrong place" });
      const verdict = moderateSay(message.text);
      if (!verdict.ok) return send(ws, "say-rejected", { reason: verdict.reason });
      broadcastRoom(self.place, "say", sayFrame(self, verdict.text));
    };

    /** Spends the socket token now, so at most a burst of lines ever waits in the queue. */
    const sayArrived = (message) => {
      if (!says.take()) return send(ws, "say-rejected", { reason: "rate limited" });
      enqueue(() => say(message));
    };

    /** A repeat join is dropped at once; joins over the rate get an error before any work. */
    const joinArrived = (message) => {
      if (players.has(ws)) return;
      if (!joins.take()) return send(ws, "error", refusal("rate limited", message.place));
      enqueue(() => join(message));
    };

    /** A place change over the rate never reaches the validator or the store; the player is parked instead. */
    const placeArrived = (message) => {
      if (!placeChanges.take()) return enqueue(() => (players.has(ws) ? refuse("rate limited", message.place) : undefined));
      enqueue(() => changePlace(message));
    };

    const handle = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, "error", { message: "invalid json" });
      }
      if (!isPlainObject(message)) return send(ws, "error", { message: "invalid message" });
      if (message.type === "join") return joinArrived(message);
      if (message.type === "place") return placeArrived(message);
      if (message.type === "say") return sayArrived(message);
      const self = players.get(ws);
      if (!self?.place) return; // not joined, or parked in no room
      if (message.type === "move") return move(self, message);
      if (message.type === "emote") return emote(self, message);
    };

    ws.on("pong", () => liveness.seen(ws));
    ws.on("message", (raw) => {
      liveness.seen(ws);
      try {
        handle(raw);
      } catch (error) {
        fail(error);
      }
    });

    const gone = () => {
      stopWatch();
      leave(ws);
    };
    ws.on("close", gone);
    ws.on("error", gone);
  });

  return wss;
}
