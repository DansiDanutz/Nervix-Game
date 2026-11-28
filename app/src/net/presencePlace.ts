/**
 * Place-scoped presence frames (C3). The client names its place with the
 * shared contract id from `placeId()` (plaza, openpoker, prop_*), never the
 * legacy `placeKey()`. The server validates the id again; this side only
 * keeps malformed ids from being sent: a malformed id means no room at all
 * (null), never the plaza, so a player is never broadcast in the wrong room.
 * A server refusal of a place empties the room (the server has parked the
 * player in no room). Pure module: no React, no DOM, and no
 * relative value imports, so `node --test` loads it as is.
 */
import type { RemotePlayer } from "./presenceCore";

export const DEFAULT_PRESENCE_PLACE = "plaza";

/** Every contract id (plaza, openpoker, prop_*) and every property id has this shape. */
const PLACE_ID = /^(plaza|openpoker|prop_[a-z0-9_]{1,40})$/;
const POSITION_SCALE = 100;
const YAW_SCALE = 1000;

const round = (value: number, scale: number) => Math.round(value * scale) / scale;

/** The presence room a player is in: a contract-shaped id, or null for no room. */
export type PresencePlace = string | null;

/** A contract-shaped place id, or null (no room) for anything else. The server checks it is real. */
export function presencePlaceId(id: string): PresencePlace {
  return PLACE_ID.test(id) ? id : null;
}

/** The join frame. Identity comes from the session cookie, so no id or name is sent. */
export function joinPlaceMessage(district: string, place: string) {
  return { type: "join" as const, district, place };
}

/** A place-change frame; `null` asks the server to take the player out of every room. */
export function placeMessage(place: PresencePlace) {
  return { type: "place" as const, place };
}

/** What to send when the place changes: `place` once joined, `join` after a refused join, nothing for no room. */
export function placeChangeFrame(joined: boolean, district: string, place: PresencePlace) {
  if (joined) return placeMessage(place);
  return place === null ? null : joinPlaceMessage(district, place);
}

interface ErrorFrame {
  type: string;
  place?: string | null;
}

/** Did the server refuse this place (unknown, full, rate limited)? It names the place it refused. */
export function isPlaceRefusal(frame: ErrorFrame, place: PresencePlace): boolean {
  return frame.type === "error" && typeof frame.place === "string" && frame.place === place;
}

export interface MoveSample {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** A move frame. `place` lets the server drop a move sent just before a place change. */
export function moveMessage(sample: MoveSample, seq: number, place: string) {
  const yaw = Number.isFinite(sample.yaw) ? round(sample.yaw, YAW_SCALE) : 0;
  return {
    type: "move" as const,
    x: round(sample.x, POSITION_SCALE),
    z: round(sample.z, POSITION_SCALE),
    yaw,
    seq,
    place,
  };
}

/** A per-socket move counter: 1, 2, 3, ... */
export function createSequence(): () => number {
  let seq = 0;
  return () => {
    seq += 1;
    return seq;
  };
}

export function forPlace(players: readonly RemotePlayer[], place: string): RemotePlayer[] {
  return players.filter((p) => p.place === place);
}

interface PlayersFrame {
  type: string;
  place?: string | null;
  players?: RemotePlayer[];
}

/** The players to show for a snapshot frame, or null when the frame belongs to another place. */
export function snapshotFor(frame: PlayersFrame, place: string): RemotePlayer[] | null {
  if (frame.place !== undefined && frame.place !== place) return null;
  return forPlace(frame.players ?? [], place);
}

interface RoomFrame extends PlayersFrame {
  left?: string[];
}

/**
 * The room after one server frame (C4), or null when the frame does not
 * belong to this place. A refusal of this place empties the room; with no
 * room (null) nothing fills it. `welcome` and `players` replace the room; a `delta`
 * upserts the players who changed this tick and drops the handles in `left`.
 * Returns a new list; the old one is never changed.
 */
export function applyRoomFrame(room: readonly RemotePlayer[], frame: RoomFrame, place: PresencePlace): RemotePlayer[] | null {
  if (place === null) return null;
  if (isPlaceRefusal(frame, place)) return [];
  if (frame.type === "welcome" || frame.type === "players") return snapshotFor(frame, place);
  if (frame.type !== "delta" || frame.place !== place) return null;
  const gone = new Set(frame.left ?? []);
  const byId = new Map(room.filter((p) => p.place === place && !gone.has(p.id)).map((p) => [p.id, p] as const));
  for (const p of forPlace(frame.players ?? [], place)) byId.set(p.id, p);
  return [...byId.values()];
}
