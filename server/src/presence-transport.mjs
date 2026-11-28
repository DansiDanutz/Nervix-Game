/**
 * Presence transport pieces (C4). Pure, clock-injected, no sockets:
 *
 * - a per-socket token bucket (the S4 limiter, now counting its drops),
 * - a per-room change batcher behind the 10 Hz tick deltas,
 * - ping/pong liveness for evicting dead sockets,
 * - a send that drops a socket whose unread backlog passed a hard cap,
 * - capacity and timing settings read from the environment.
 *
 * presence.mjs wires these to the WebSocket server.
 */

const MS_PER_SECOND = 1000;

export const DEFAULT_TICK_MS = 100; // 10 Hz
export const DEFAULT_HEARTBEAT_MS = 15 * MS_PER_SECOND;
/** Bytes a socket may have queued but unread before it is dropped as a slow reader. */
export const DEFAULT_MAX_BUFFERED_BYTES = 1024 * 1024;

const OPEN = 1;

/**
 * Sends `data` to an open socket, unless its backlog is already past
 * `maxBufferedBytes`: then the socket is terminated, since skipping a delta
 * would leave the client's room wrong. A reader that stops reading cannot grow
 * server memory without bound, whatever it keeps sending. True when sent.
 */
export function deliver(socket, data, maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES) {
  if (socket.readyState !== OPEN) return false;
  if (socket.bufferedAmount > maxBufferedBytes) {
    socket.terminate();
    return false;
  }
  socket.send(data);
  return true;
}

/** Accepted ranges for the environment settings; anything else keeps the default. */
export const TRANSPORT_LIMITS = Object.freeze({
  roomCapacity: Object.freeze({ min: 1, max: 5000 }),
  maxConnections: Object.freeze({ min: 1, max: 20000 }),
  tickMs: Object.freeze({ min: 10, max: 1000 }),
  heartbeatMs: Object.freeze({ min: 1000, max: 120 * MS_PER_SECOND }),
});

const ENV_KEYS = Object.freeze({
  roomCapacity: "PRESENCE_ROOM_CAPACITY",
  maxConnections: "PRESENCE_MAX_CONNECTIONS",
  tickMs: "PRESENCE_TICK_MS",
  heartbeatMs: "PRESENCE_HEARTBEAT_MS",
});

/** A token bucket: `take()` is true while the caller is inside its rate. */
export function createTokenBucket({ burst, perSecond }, now = Date.now) {
  let tokens = burst;
  let last = now();
  let drops = 0;
  return Object.freeze({
    take() {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / MS_PER_SECOND) * perSecond);
      last = t;
      if (tokens < 1) {
        drops += 1;
        return false;
      }
      tokens -= 1;
      return true;
    },
    dropped: () => drops,
  });
}

const addTo = (table, place, handle) => {
  const set = table.get(place) ?? new Set();
  set.add(handle);
  table.set(place, set);
};

const removeFrom = (table, place, handle) => table.get(place)?.delete(handle);

/**
 * Collects, per room, which players changed and which left since the last
 * drain. Many moves by one player in a tick become one entry. A player who
 * leaves and comes back within one tick counts as changed, not left.
 */
export function createRoomBatcher() {
  let changed = new Map(); // place -> Set(handle)
  let left = new Map();
  return Object.freeze({
    touch(place, handle) {
      removeFrom(left, place, handle);
      addTo(changed, place, handle);
    },
    leave(place, handle) {
      removeFrom(changed, place, handle);
      addTo(left, place, handle);
    },
    /** Frozen per-room entries `{ place, changed, left }`, then an empty batch. */
    drain() {
      const places = new Set([...changed.keys(), ...left.keys()]);
      const entries = [...places]
        .map((place) => Object.freeze({
          place,
          changed: Object.freeze([...(changed.get(place) ?? [])]),
          left: Object.freeze([...(left.get(place) ?? [])]),
        }))
        .filter((e) => e.changed.length > 0 || e.left.length > 0);
      changed = new Map();
      left = new Map();
      return entries;
    },
  });
}

/**
 * Ping/pong liveness. Each sweep pings every socket that has shown signs of
 * life since the last sweep and evicts the ones that have not. Weakly held, so
 * a socket that goes without a `forget` (refused before any close handler) is
 * never kept alive here.
 */
export function createLiveness() {
  const pending = new WeakSet(); // pinged, no answer yet
  return Object.freeze({
    seen(socket) {
      pending.delete(socket);
    },
    forget(socket) {
      pending.delete(socket);
    },
    sweep(sockets) {
      const evict = [];
      const ping = [];
      for (const socket of sockets) {
        if (pending.has(socket)) {
          pending.delete(socket);
          evict.push(socket);
        } else {
          pending.add(socket);
          ping.push(socket);
        }
      }
      return Object.freeze({ evict: Object.freeze(evict), ping: Object.freeze(ping) });
    },
  });
}

const integerIn = (raw, { min, max }) => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
};

/** The presence settings the environment sets validly; unset or invalid keys are left out. */
export function presenceSettingsFromEnv(env = {}) {
  const source = env ?? {};
  const entries = Object.entries(ENV_KEYS)
    .map(([name, key]) => [name, integerIn(source[key], TRANSPORT_LIMITS[name])])
    .filter(([, value]) => value !== null);
  return Object.freeze(Object.fromEntries(entries));
}
