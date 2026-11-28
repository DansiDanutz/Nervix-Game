/**
 * Shared district presence.
 *
 * Public presence only: an opaque handle, a display name, the district and a
 * position. Merchant conversations are never broadcast here.
 *
 * Identity is session-bound (S4). On `join` the server reads the
 * `nervix_session` cookie of the upgrade request through `resolveSession(req)`,
 * which returns the session user ({ id, displayName }) or null. Without a
 * session the player is a guest. Anything the client claims in `join` (userId,
 * id, name) is ignored. Every connection gets its own random handle, so user
 * ids (`usr_*`, `demo_*`) never reach another player. A signed-in socket is
 * re-checked periodically and closed once its session ends.
 *
 * Abuse bounds: small frames (maxPayload), a cap on open sockets, an Origin
 * check on the upgrade, per-socket move/emote rate limits, and no session
 * lookup before a join. One bad frame can never take the process down.
 */

import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";

const MAX_PLAYERS = 200;
const BOUND = 40;
const NAME_MAX = 40;
const HANDLE_BYTES = 6;
const DEFAULT_DISTRICT = "central-plaza";
const DEFAULT_EMOTE = "wave";
const OPEN = 1;
const CLOSE_TRY_AGAIN_LATER = 1013;
const CLOSE_INTERNAL_ERROR = 1011;
const CLOSE_SESSION_ENDED = 4001;
const HTTP_FORBIDDEN = 403;
const MS_PER_SECOND = 1000;

export const GUEST_NAME = "Guest";
export const HANDLE_PATTERN = /^p_[0-9a-f]{12}$/;
export const DEFAULT_MAX_PAYLOAD = 4 * 1024;
export const DEFAULT_MAX_CONNECTIONS = MAX_PLAYERS * 2;
export const DEFAULT_MOVE_LIMIT = Object.freeze({ burst: 20, perSecond: 20 });
export const DEFAULT_EMOTE_LIMIT = Object.freeze({ burst: 3, perSecond: 1 });
export const DEFAULT_SESSION_RECHECK_MS = 60 * MS_PER_SECOND;

// Lowercase slugs only: no underscore, so an id like usr_x cannot be echoed.
const DISTRICT_SLUG = /^[a-z][a-z0-9-]{0,39}$/;
const EMOTE_SLUG = /^[a-z][a-z0-9-]{0,19}$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const newHandle = () => `p_${randomBytes(HANDLE_BYTES).toString("hex")}`;
const clamp = (v) => Math.max(-BOUND, Math.min(BOUND, v));
const slugOr = (value, pattern, fallback) => (typeof value === "string" && pattern.test(value) ? value : fallback);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const noSession = async () => null;
const logError = (error) => console.error(`presence: ${error?.message ?? error}`);

const parseOrigins = (value) => (value ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const hostnameOf = (host) => (host ?? "").replace(/:\d+$/, "").toLowerCase();

/**
 * May a page at `req.headers.origin` open a presence socket? No Origin means a
 * non-browser client, which carries no ambient cookie. Otherwise the origin
 * must be allowlisted, on the request's own host, or loopback talking to a
 * loopback host (the Vite dev proxy).
 */
export function originAllowed(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const originHost = parsed.hostname.toLowerCase();
  const requestHost = hostnameOf(req.headers.host);
  if (originHost === requestHost) return true;
  return LOOPBACK.has(originHost) && LOOPBACK.has(requestHost);
}

/** A token bucket: `take()` is true while the socket is inside its rate. */
function rateLimiter({ burst, perSecond }, now = Date.now) {
  let tokens = burst;
  let last = now();
  return {
    take() {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / MS_PER_SECOND) * perSecond);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

/** The server-side identity for one connection. Never derived from the client. */
async function connectionIdentity(req, resolveSession, onError) {
  try {
    const user = await resolveSession(req);
    const name = typeof user?.displayName === "string" ? user.displayName.trim().slice(0, NAME_MAX) : "";
    return user?.id ? { userId: user.id, name: name || GUEST_NAME } : { userId: null, name: GUEST_NAME };
  } catch (error) {
    onError(new Error(`session lookup failed (${error?.message ?? error}); admitting as guest`));
    return { userId: null, name: GUEST_NAME };
  }
}

/** Public view of a player record: the handle, never the user id. */
const publicView = ({ handle, name, district, x, z }) => ({ id: handle, name, district, x, z });

export function attachPresence(server, options = {}) {
  const {
    path = "/presence",
    resolveSession = noSession,
    onError = logError,
    maxPayload = DEFAULT_MAX_PAYLOAD,
    maxConnections = DEFAULT_MAX_CONNECTIONS,
    moveLimit = DEFAULT_MOVE_LIMIT,
    emoteLimit = DEFAULT_EMOTE_LIMIT,
    sessionRecheckMs = DEFAULT_SESSION_RECHECK_MS,
    allowedOrigins = parseOrigins(process.env.PRESENCE_ALLOWED_ORIGINS),
  } = options;

  const verifyClient = ({ req }, done) => (originAllowed(req, allowedOrigins) ? done(true) : done(false, HTTP_FORBIDDEN));
  const wss = new WebSocketServer({ server, path, maxPayload, verifyClient });
  const players = new Map(); // ws -> record (userId stays server-side)

  const list = () => [...players.values()].map(publicView);

  const broadcast = (type, payload = {}) => {
    const data = JSON.stringify({ type, ...payload });
    for (const client of wss.clients) {
      if (client.readyState === OPEN) client.send(data);
    }
  };

  const send = (ws, type, payload = {}) => {
    if (ws.readyState === OPEN) ws.send(JSON.stringify({ type, ...payload }));
  };

  const leave = (ws) => {
    if (players.delete(ws)) broadcast("players", { players: list() });
  };

  /** Closes a signed-in socket once its session no longer resolves to the same user. */
  const watchSession = (ws, req, userId) => {
    if (!userId || !(sessionRecheckMs > 0)) return () => {};
    const timer = setInterval(async () => {
      try {
        const user = await resolveSession(req);
        if (user?.id !== userId) ws.close(CLOSE_SESSION_ENDED, "session ended");
      } catch (error) {
        onError(new Error(`session recheck failed (${error?.message ?? error}); keeping the socket`));
      }
    }, sessionRecheckMs);
    timer.unref?.();
    return () => clearInterval(timer);
  };

  wss.on("connection", (ws, req) => {
    if (wss.clients.size > maxConnections) return ws.close(CLOSE_TRY_AGAIN_LATER, "server busy");

    const moves = rateLimiter(moveLimit);
    const emotes = rateLimiter(emoteLimit);
    let joining = false;
    let stopWatch = () => {};

    const join = async (message) => {
      if (joining) return;
      joining = true;
      const { userId, name } = await connectionIdentity(req, resolveSession, onError);
      if (ws.readyState !== OPEN) return;
      if (players.size >= MAX_PLAYERS) return send(ws, "error", { message: "room full" });
      const record = {
        handle: newHandle(),
        userId,
        name,
        district: slugOr(message.district, DISTRICT_SLUG, DEFAULT_DISTRICT),
        x: 0,
        z: 0,
      };
      players.set(ws, record);
      stopWatch = watchSession(ws, req, userId);
      return send(ws, "welcome", { id: record.handle, players: list() });
    };

    const move = (self, message) => {
      const x = Number(message.x);
      const z = Number(message.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || !moves.take()) return;
      players.set(ws, { ...self, x: clamp(x), z: clamp(z), district: slugOr(message.district, DISTRICT_SLUG, self.district) });
      broadcast("players", { players: list() });
    };

    const emote = (self, message) => {
      if (!emotes.take()) return;
      broadcast("emote", { id: self.handle, emote: slugOr(message.emote, EMOTE_SLUG, DEFAULT_EMOTE) });
    };

    const handle = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, "error", { message: "invalid json" });
      }
      if (!isPlainObject(message)) return send(ws, "error", { message: "invalid message" });
      if (message.type === "join") {
        return void join(message).catch((error) => {
          onError(error);
          ws.close(CLOSE_INTERNAL_ERROR, "internal error");
        });
      }
      const self = players.get(ws);
      if (!self) return;
      if (message.type === "move") return move(self, message);
      if (message.type === "emote") return emote(self, message);
    };

    ws.on("message", (raw) => {
      try {
        handle(raw);
      } catch (error) {
        onError(error);
        ws.close(CLOSE_INTERNAL_ERROR, "internal error");
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
