/**
 * Shared district presence.
 *
 * Public presence only: position, display name and district. Merchant
 * conversations are never broadcast here. The server is authoritative for
 * membership; clients cannot claim another user's id.
 */

import { WebSocketServer } from "ws";

const MAX_PLAYERS = 200;

export function attachPresence(server, { path = "/presence" } = {}) {
  const wss = new WebSocketServer({ server, path });
  const players = new Map(); // ws -> record

  const list = () =>
    [...players.values()].map(({ id, name, district, x, z }) => ({ id, name, district, x, z }));

  const broadcast = (type, payload = {}) => {
    const data = JSON.stringify({ type, ...payload });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  };

  const send = (ws, type, payload = {}) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
  };

  wss.on("connection", (ws) => {
    let joined = false;

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, "error", { message: "invalid json" });
      }

      if (message.type === "join") {
        if (joined) return;
        if (players.size >= MAX_PLAYERS) return send(ws, "error", { message: "room full" });
        const id = String(message.userId ?? "").slice(0, 64) || `guest_${Math.random().toString(36).slice(2, 8)}`;
        players.set(ws, {
          id,
          name: String(message.name ?? "Traveler").slice(0, 40),
          district: String(message.district ?? "central-plaza").slice(0, 40),
          x: 0,
          z: 0,
        });
        joined = true;
        return send(ws, "welcome", { id, players: list() });
      }

      const self = players.get(ws);
      if (!self) return;

      if (message.type === "move") {
        const x = Number(message.x);
        const z = Number(message.z);
        if (Number.isFinite(x) && Number.isFinite(z)) {
          self.x = Math.max(-40, Math.min(40, x));
          self.z = Math.max(-40, Math.min(40, z));
          if (typeof message.district === "string") self.district = message.district.slice(0, 40);
        }
        return broadcast("players", { players: list() });
      }

      if (message.type === "emote") {
        return broadcast("emote", { id: self.id, emote: String(message.emote ?? "wave").slice(0, 20) });
      }
    });

    ws.on("close", () => {
      if (players.delete(ws)) broadcast("players", { players: list() });
    });

    ws.on("error", () => {
      if (players.delete(ws)) broadcast("players", { players: list() });
    });
  });

  return wss;
}