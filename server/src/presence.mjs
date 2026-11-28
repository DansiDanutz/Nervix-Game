/**
 * Shared presence, one room per place (C3).
 *
 * Public presence only, exactly {id (the opaque handle), name, preset, place,
 * x, z, yaw} (C9, presence-privacy.mjs). `name` is the display name, or
 * "Anonymous" when the user hides it, is anonymous, or holds a name the
 * display-name policy refuses; an anonymous user's preset is derived from the
 * handle. Merchant conversations are never broadcast here.
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
import { GUEST_NAME, connectionIdentity, publicIdentity, sessionName } from "./presence-identity.mjs";
import { publicView } from "./presence-privacy.mjs";
import { originAllowed } from "./presence-origin.mjs";
import { DEFAULT_MAX_QUEUE, DEFAULT_PLACE_LIMIT, createWorkQueue } from "./presence-queue.mjs";
import { createLiveness, createRoomBatcher, createTokenBucket, deliver } from "./presence-transport.mjs";
import { moderateSay, sayFrame } from "./presence-chat.mjs";
import { createSayLimits } from "./presence-chat-limits.mjs";
import { every, presenceOptions } from "./presence-config.mjs";
import { createRooms } from "./presence-rooms.mjs";

const HANDLE_BYTES = 6;
const DEFAULT_EMOTE = "wave";
const OPEN = 1;
const CLOSE_TRY_AGAIN_LATER = 1013;
const CLOSE_INTERNAL_ERROR = 1011;
const CLOSE_POLICY_VIOLATION = 1008;
const CLOSE_SESSION_ENDED = 4001;
const HTTP_FORBIDDEN = 403;

export { GUEST_NAME };
export const HANDLE_PATTERN = /^p_[0-9a-f]{12}$/;
export {
  DEFAULT_EMOTE_LIMIT, DEFAULT_MAX_CONNECTIONS, DEFAULT_MAX_PAYLOAD, DEFAULT_MOVE_LIMIT, DEFAULT_ROOM_CAPACITY,
  DEFAULT_SESSION_RECHECK_MS,
} from "./presence-config.mjs";
export { DEFAULT_MAX_QUEUE, DEFAULT_PLACE_LIMIT, originAllowed };

// Lowercase slugs only: no underscore, so an id like usr_x cannot be echoed.
const EMOTE_SLUG = /^[a-z][a-z0-9-]{0,19}$/;

const newHandle = () => `p_${randomBytes(HANDLE_BYTES).toString("hex")}`;
const slugOr = (value, pattern, fallback) => (typeof value === "string" && pattern.test(value) ? value : fallback);
const finiteOr = (value, fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The refused place, echoed back to its sender only when it is place-shaped (never a user id). */
const refusal = (message, requested) => ({ message, place: isPlaceShaped(requested) ? requested : null });

export function attachPresence(server, options = {}) {
  const {
    path, resolveSession, resolvePreset, resolvePrivacy, isKnownProperty, onError, maxPayload, maxConnections, roomCapacity,
    tickMs, heartbeatMs, maxBufferedBytes, clock, placeBounds, moveLimit, emoteLimit, placeLimit, maxQueue,
    sayLimit, sayUserLimit, sayAddressLimit, sessionRecheckMs, allowedOrigins,
  } = presenceOptions(options);

  const verifyClient = ({ req }, done) => (originAllowed(req, allowedOrigins) ? done(true) : done(false, HTTP_FORBIDDEN));
  const wss = new WebSocketServer({ server, path, maxPayload, verifyClient });
  const players = new Map(); // ws -> record (userId stays server-side)
  const refreshers = new Map(); // ws -> () => Promise, re-reads that socket's session and privacy
  const validatePlace = createPlaceValidator({ isKnownProperty, onError, now: clock.now });
  const batch = createRoomBatcher();
  const liveness = createLiveness();
  const sharedSays = createSayLimits({ perUser: sayUserLimit, perAddress: sayAddressLimit }, clock.now);
  const { roomOf, roomSize, broadcastRoom, flush } = createRooms({ players, batch, publicView, maxBufferedBytes });

  const send = (ws, type, payload = {}) => deliver(ws, JSON.stringify({ type, ...payload }), maxBufferedBytes);

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
    refreshers.delete(ws);
    const record = players.get(ws);
    if (players.delete(ws) && record.place) batch.leave(record.place, record.handle);
  };

  /**
   * C9: rebuilds a connected player's shown name and preset from the current
   * session and privacy settings, so hiding a name takes effect without a
   * reconnect. Only name and preset change; the room hears it on the next tick.
   */
  const reapplyIdentity = async (ws, user) => {
    const before = players.get(ws);
    if (!before) return;
    const shown = await publicIdentity({ userId: user.id, name: sessionName(user) }, before.handle, { resolvePreset, resolvePrivacy, onError });
    const self = players.get(ws);
    if (!self || (self.name === shown.name && self.preset === shown.preset)) return;
    players.set(ws, Object.freeze({ ...self, name: shown.name, preset: shown.preset }));
    if (self.place) batch.touch(self.place, self.handle);
  };

  /** Closes a signed-in socket once its session no longer resolves to the same user; otherwise re-applies its identity. */
  const recheckSession = async (ws, req, userId) => {
    try {
      const user = await resolveSession(req);
      if (user?.id !== userId) return ws.close(CLOSE_SESSION_ENDED, "session ended");
      await reapplyIdentity(ws, user);
    } catch (error) {
      onError(new Error(`session recheck failed (${error?.message ?? error}); keeping the socket`));
    }
  };

  const watchSession = (ws, req, userId) => {
    if (!userId) return () => {};
    refreshers.set(ws, Object.freeze({ userId, run: () => recheckSession(ws, req, userId) }));
    if (!(sessionRecheckMs > 0)) return () => {};
    return every(clock, sessionRecheckMs, () => recheckSession(ws, req, userId));
  };

  /** Re-applies identity for every socket of `userId` now (call after PUT /me/privacy or /me/avatar). Never throws. */
  wss.refreshUser = async (userId) => {
    const runs = [...refreshers.values()].filter((r) => r.userId === userId).map((r) => r.run());
    await Promise.all(runs);
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
      const shown = await publicIdentity({ userId, name }, handle, { resolvePreset, resolvePrivacy, onError });
      if (ws.readyState !== OPEN) return;
      // Re-checked after the last await: concurrent joins may have filled the room.
      if (roomSize(place) >= roomCapacity) return send(ws, "error", { message: "room full" });
      // `name` is the shown name (C9); seq stays server-side for stale-move checks.
      const record = Object.freeze({ handle, userId, name: shown.name, preset: shown.preset, place, x: 0, z: 0, yaw: 0, seq: 0 });
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
