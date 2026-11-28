import { useEffect, useRef, useState } from "react";

/** A player as the server broadcasts it. `id` is an opaque per-connection handle, never a user id. */
export interface RemotePlayer {
  id: string;
  name: string;
  district: string;
  x: number;
  z: number;
}

interface PresenceOptions {
  district: string;
  /** Reconnect trigger only: when the session changes the server re-reads the cookie. Never sent. */
  userId?: string;
  /** Ignored. The server sets the display name from the session. */
  name?: string;
}

const MAX_BACKOFF_STEPS = 5;
const BACKOFF_STEP_MS = 500;
const POSITION_SCALE = 100;

/**
 * Same-origin by default, through the Vite `/presence` WebSocket proxy, so the
 * session cookie reaches the upgrade. An explicit VITE_WS_URL still wins.
 */
export function presenceUrl(location: { protocol: string; host: string }, override?: string): string {
  if (override) return override;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/presence`;
}

/** The join frame. Identity comes from the session cookie, so no id or name is sent. */
export function joinMessage(district: string): { type: "join"; district: string } {
  return { type: "join", district };
}

/** One avatar per player id; a player with several open tabs keeps their latest position. */
export function uniqueById(players: RemotePlayer[]): RemotePlayer[] {
  return [...new Map(players.map((p) => [p.id, p] as const)).values()];
}

/** Everyone except this connection. Until the server names us, show nobody (no self ghost). */
export function othersOf(players: RemotePlayer[], selfHandle: string | null): RemotePlayer[] {
  if (!selfHandle) return [];
  return uniqueById(players).filter((p) => p.id !== selfHandle);
}

/**
 * Closes a socket we no longer want. Handlers are detached first, so its late
 * onclose or onmessage can never clear or overwrite the new socket's state.
 */
export function retireSocket(ws: WebSocket | null): void {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
}

/**
 * Shared district presence. Public data only — never a merchant conversation.
 * `players` excludes this player. Reconnects with a small backoff; the city
 * keeps working while offline.
 */
export function usePresence(options: PresenceOptions) {
  const { district, userId } = options;
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let attempts = 0;
    let selfHandle: string | null = null;
    const url = presenceUrl(window.location, import.meta.env?.VITE_WS_URL as string | undefined);

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      socket.current = ws;
      selfHandle = null;
      ws.onopen = () => {
        attempts = 0;
        setStatus("live");
        ws.send(JSON.stringify(joinMessage(district)));
      };
      ws.onmessage = (event) => {
        if (socket.current !== ws) return;
        try {
          const msg = JSON.parse(event.data as string) as { type: string; id?: string; players?: RemotePlayer[] };
          if (msg.type === "welcome") selfHandle = msg.id ?? null;
          if (msg.type === "welcome" || msg.type === "players") setPlayers(othersOf(msg.players ?? [], selfHandle));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (socket.current !== ws) return;
        setStatus("offline");
        setPlayers([]);
        if (closed) return;
        attempts = Math.min(attempts + 1, MAX_BACKOFF_STEPS);
        setTimeout(connect, attempts * BACKOFF_STEP_MS);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      retireSocket(socket.current);
      socket.current = null;
    };
  }, [district, userId]);

  const sendMove = (x: number, z: number) => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "move", x: Math.round(x * POSITION_SCALE) / POSITION_SCALE, z: Math.round(z * POSITION_SCALE) / POSITION_SCALE }));
    }
  };

  return { players, status, sendMove };
}
