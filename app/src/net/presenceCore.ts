/**
 * Presence frames and filters, free of React and of relative value imports,
 * so `node --test` loads this module as is. The hook lives in ./presence.
 */

/** A player as the server broadcasts it. `id` is an opaque per-connection handle, never a user id. */
export interface RemotePlayer {
  id: string;
  name: string;
  district: string;
  /** Shared contract place id (plaza, openpoker, prop_*). */
  place: string;
  /** Avatar preset id from shared/contracts/avatar-presets.json. */
  preset: string;
  x: number;
  z: number;
  yaw: number;
  /** The sender's last accepted move sequence (0 before the first move). */
  seq: number;
}

/**
 * Same-origin by default, through the Vite `/presence` WebSocket proxy, so the
 * session cookie reaches the upgrade. An explicit VITE_WS_URL still wins.
 */
export function presenceUrl(location: { protocol: string; host: string }, override?: string): string {
  if (override) return override;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/presence`;
}

/** The legacy join frame (district only). Identity comes from the session cookie, so no id or name is sent. */
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
