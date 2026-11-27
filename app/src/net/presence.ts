import { useEffect, useRef, useState } from "react";

export interface RemotePlayer {
  id: string;
  name: string;
  district: string;
  x: number;
  z: number;
}

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8787/presence";

/**
 * Shared district presence. Public data only — never a merchant conversation.
 * Reconnects with a small backoff; the city keeps working while offline.
 */
export function usePresence({ userId, name, district }: { userId: string; name: string; district: string }) {
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry = 0;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(WS_URL);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        setStatus("live");
        ws.send(JSON.stringify({ type: "join", userId, name, district }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; players?: RemotePlayer[] };
          if (msg.type === "welcome" || msg.type === "players") setPlayers(msg.players ?? []);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setStatus("offline");
        if (!closed) retry = Math.min(retry + 1, 5) * 500;
        setTimeout(connect, retry);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      socket.current?.close();
    };
  }, [userId, name, district]);

  const sendMove = (x: number, z: number) => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "move", x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }));
    }
  };

  return { players, status, sendMove };
}