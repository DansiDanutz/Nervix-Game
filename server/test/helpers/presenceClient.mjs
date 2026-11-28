/**
 * Presence test client (C4). Room state is rebuilt the way a browser does it:
 * `welcome` and `players` replace the room, `delta` upserts changed players
 * and removes `left` handles. `nextRoom` waits for the first room frame after
 * which a predicate holds.
 */
import http from "node:http";
import WebSocket from "ws";

const ROOM_TYPES = new Set(["welcome", "players", "delta"]);

export const send = (ws, message) => ws.send(JSON.stringify(message));
export const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
export const closeAll = (...sockets) => sockets.forEach((ws) => ws.close());
export const closed = (ws) => new Promise((resolve) => ws.once("close", (code) => resolve(code)));

/** The room after applying one frame. Frames for another place are ignored. */
export function applyRoomFrame(room, frame) {
  if (frame.type === "welcome" || frame.type === "players") {
    return { place: frame.place, players: new Map((frame.players ?? []).map((p) => [p.id, p])) };
  }
  if (frame.type !== "delta" || frame.place !== room.place) return room;
  const players = new Map(room.players);
  for (const id of frame.left ?? []) players.delete(id);
  for (const p of frame.players ?? []) players.set(p.id, p);
  return { place: room.place, players };
}

export const roomView = (ws) => ({ place: ws.room.place, players: [...ws.room.players.values()] });

/** Starts tracking `ws.room` from the frames the socket receives. */
export function trackRoom(ws) {
  ws.room = { place: null, players: new Map() };
  ws.on("message", (raw) => {
    const frame = JSON.parse(raw.toString());
    if (ROOM_TYPES.has(frame.type)) ws.room = applyRoomFrame(ws.room, frame);
  });
  return ws;
}

/** Resolves with the room view after the first room frame for which `where(view)` holds. */
export const nextRoom = (ws, where = () => true) =>
  new Promise((resolve) => {
    const onMessage = (raw) => {
      if (!ROOM_TYPES.has(JSON.parse(raw.toString()).type)) return;
      const view = roomView(ws);
      if (!where(view)) return;
      ws.off("message", onMessage);
      resolve(view);
    };
    ws.on("message", onMessage);
  });

export const next = (ws, type, where = () => true) =>
  new Promise((resolve) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type && where(msg)) {
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
  });

/** Opens a socket that records raw frames (`ws.frames`) and tracks its room. */
export const open = (url, { cookie, autoPong = true } = {}) =>
  new Promise((resolve, reject) => {
    const headers = cookie ? { cookie: `nervix_session=${cookie}` } : {};
    const ws = new WebSocket(url, { headers, autoPong });
    ws.frames = [];
    ws.on("message", (raw) => ws.frames.push(raw.toString()));
    trackRoom(ws);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

export async function join(ws, message = {}) {
  const welcome = next(ws, "welcome");
  send(ws, { type: "join", ...message });
  return welcome;
}

/**
 * A barrier: the server answers an invalid frame with an error, in order, so
 * once the error arrives every earlier frame from this socket was handled and
 * every frame the server sent it before that has been received.
 */
export async function sync(ws) {
  const reply = next(ws, "error", (m) => m.message === "invalid message");
  ws.send("null");
  await reply;
}

/** A presence server on an ephemeral loopback port; the tick is short so real-time tests stay fast. */
export function withPresence(attachPresence, options, fn) {
  return async () => {
    const server = http.createServer();
    attachPresence(server, { onError: () => {}, tickMs: 20, ...options });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      await fn(`ws://127.0.0.1:${server.address().port}/presence`);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  };
}

export const selfIn = (view, id) => view.players.find((p) => p.id === id);
export const has = (view, id) => view.players.some((p) => p.id === id);
