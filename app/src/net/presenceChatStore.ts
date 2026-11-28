/**
 * The one place-chat store for the running client (CT3), and the hooks that
 * read it. `usePresence` feeds it frames and its live sender; PlayerChat and
 * the scene's speech bubbles read it. Memory only: nothing is persisted.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_PRESENCE_PLACE } from "./presencePlace";
import { bubblesOf, createChatStore, type Bubble, type ChatState } from "./presenceChat";

export const chatStore = createChatStore(DEFAULT_PRESENCE_PLACE);

const EXPIRY_SLACK_MS = 20;

/** DEV-only test hook (E2E): the place, the visible log and the live bubbles. */
function publishDebug(state: ChatState): void {
  if (!import.meta.env?.DEV) return;
  (window as unknown as Record<string, unknown>).__nervixChat = Object.freeze({
    place: state.place,
    lines: state.lines.map((l) => ({ name: l.name, text: l.text, self: l.self })),
    notice: state.notice,
    bubbles: bubblesOf(state, Date.now()).map((b) => ({ playerId: b.playerId, self: b.self, text: b.text })),
  });
}
if (typeof window !== "undefined") chatStore.subscribe(() => publishDebug(chatStore.get()));

export function useChat(): ChatState {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get, chatStore.get);
}

/**
 * Speech bubbles for the scene: each speaker's latest line until it expires.
 * `playerId` is the presence handle (RemotePlayer.id); `self` marks the local
 * avatar. Re-renders on new lines and once more when the next bubble expires.
 */
export function useChatBubbles(): readonly Bubble[] {
  const chat = useChat();
  const [, setExpired] = useState(0);
  const live = bubblesOf(chat, Date.now());
  const nextExpiry = live.length > 0 ? Math.min(...live.map((b) => b.expiresAt)) : null;
  useEffect(() => {
    if (nextExpiry === null) return;
    const id = setTimeout(() => setExpired((n) => n + 1), Math.max(0, nextExpiry - Date.now()) + EXPIRY_SLACK_MS);
    return () => clearTimeout(id);
  }, [nextExpiry]);
  return live;
}
