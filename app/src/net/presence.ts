import { useEffect, useRef, useState } from "react";
import { placeId } from "../world/place";
import { usePlace } from "../world/usePlace";
import { playerState } from "../player/playerState";
import { othersOf, presenceUrl, retireSocket, type RemotePlayer } from "./presenceCore";
import {
  applyRoomFrame, createSequence, isPlaceRefusal, joinPlaceMessage, moveMessage, placeChangeFrame, presencePlaceId,
  type PresencePlace,
} from "./presencePlace";
import { chatStore } from "./presenceChatStore";

export { joinMessage, othersOf, presenceUrl, retireSocket, uniqueById, type RemotePlayer } from "./presenceCore";

interface PresenceOptions {
  district: string;
  /** Reconnect trigger only: when the session changes the server re-reads the cookie. Never sent. */
  userId?: string;
  /** Ignored. The server sets the display name from the session. */
  name?: string;
}

interface ServerFrame {
  type: string;
  id?: string;
  message?: string;
  place?: string | null;
  players?: RemotePlayer[];
  left?: string[];
}

const CHAT_TYPES: ReadonlySet<string> = new Set(["say", "say-rejected"]);
const MAX_BACKOFF_STEPS = 5;
const BACKOFF_STEP_MS = 500;
/** A refused place that may free up (room full, rate limited) is asked for again after this long. */
const REFUSAL_RETRY_MS = 3000;
const PERMANENT_REFUSAL = "unknown place";

/** DEV-only test hook (E2E): this connection's handle, place and the handles it shows. */
function publishDebug(self: string | null, place: PresencePlace, players: RemotePlayer[]): void {
  if (!import.meta.env?.DEV) return;
  (window as unknown as Record<string, unknown>).__nervixPresence = Object.freeze({ self, place, players: players.map((p) => p.id) });
}

/** The contract place id of the place the player is in, as presence sends it; null for no room. */
function usePresencePlace(): PresencePlace {
  return presencePlaceId(placeId(usePlace()));
}

/**
 * Place-scoped presence (C3). Public data only — never a merchant conversation.
 * `players` excludes this player and anyone outside the current place. The
 * socket stays open across place changes and sends a `place` frame instead.
 * Reconnects with a small backoff; the city keeps working while offline.
 */
export function usePresence(options: PresenceOptions) {
  const { district, userId } = options;
  const place = usePresencePlace();
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const socket = useRef<WebSocket | null>(null);
  const placeRef = useRef(place);
  const nextSeq = useRef(createSequence());
  const joined = useRef(false); // the server holds a record for this socket (welcome seen)

  useEffect(() => {
    let closed = false;
    let attempts = 0;
    let selfHandle: string | null = null;
    let room: RemotePlayer[] = []; // the whole room, self included, rebuilt from welcome/players/delta
    const url = presenceUrl(window.location, import.meta.env?.VITE_WS_URL as string | undefined);

    const show = (list: RemotePlayer[]) => {
      const others = othersOf(list, selfHandle);
      setPlayers(others);
      publishDebug(selfHandle, placeRef.current, others);
    };

    /** The server refused our place and parked us in no room; ask again later when the refusal may clear. */
    const retryRefused = (ws: WebSocket, msg: ServerFrame) => {
      if (msg.message === PERMANENT_REFUSAL) return;
      const refused = msg.place;
      setTimeout(() => {
        if (closed || socket.current !== ws || ws.readyState !== WebSocket.OPEN || placeRef.current !== refused) return;
        const frame = placeChangeFrame(joined.current, district, refused ?? null);
        if (frame) ws.send(JSON.stringify(frame));
      }, REFUSAL_RETRY_MS);
    };

    const onFrame = (ws: WebSocket, msg: ServerFrame) => {
      if (CHAT_TYPES.has(msg.type)) return chatStore.receive(msg, selfHandle, Date.now());
      if (msg.type === "welcome") {
        selfHandle = msg.id ?? null;
        joined.current = true;
      }
      if (isPlaceRefusal(msg, placeRef.current)) retryRefused(ws, msg);
      const next = applyRoomFrame(room, msg, placeRef.current);
      if (!next) return;
      room = next;
      show(room);
    };

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(url);
      socket.current = ws;
      nextSeq.current = createSequence();
      joined.current = false;
      selfHandle = null;
      room = [];
      ws.onopen = () => {
        attempts = 0;
        setStatus("live");
        const place = placeRef.current;
        if (place !== null) ws.send(JSON.stringify(joinPlaceMessage(district, place))); // no room: join once there is one
        chatStore.setSender((frame) => {
          if (socket.current === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
        });
      };
      ws.onmessage = (event) => {
        if (socket.current !== ws) return;
        try {
          onFrame(ws, JSON.parse(event.data as string) as ServerFrame);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (socket.current !== ws) return;
        chatStore.setSender(null);
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
      chatStore.setSender(null);
      retireSocket(socket.current);
      socket.current = null;
    };
  }, [district, userId]);

  // A place change keeps the socket: the old room's players and chat go at once, the server sends the new room.
  // A refused join is retried as a join; no room (malformed id) parks the player server-side.
  useEffect(() => {
    chatStore.enterPlace(place ?? "");
    if (placeRef.current === place) return;
    placeRef.current = place;
    setPlayers([]);
    const ws = socket.current;
    const frame = placeChangeFrame(joined.current, district, place);
    if (frame && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  }, [place, district]);

  /** Position from the controller; yaw from playerState (0 until the controller publishes it, CT1). */
  const sendMove = (x: number, z: number) => {
    const ws = socket.current;
    const place = placeRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || place === null) return;
    const sample = { x, z, yaw: playerState.ref.current.yaw };
    ws.send(JSON.stringify(moveMessage(sample, nextSeq.current(), place)));
  };

  return { players, status, sendMove };
}
