/**
 * CT5 screen-reader announcements for place and door changes, read by the
 * aria-live region (ui/LiveRegion.tsx). Pure: type-only imports, no DOM.
 */
import type { Place } from "../scene/slice";
import type { Target } from "./targets";

/** What a door in reach offers: "Enter OpenPoker", "Enter DanGG", "Exit to Plaza". */
export function targetAnnouncement(t: Target | null): string | null {
  if (!t) return null;
  return t.kind === "exit" ? `Exit to ${t.label}` : `Enter ${t.label}`;
}

/** Where the player now is. */
export function placeAnnouncement(place: Place): string {
  if (place.kind === "plaza") return "On the plaza";
  if (place.kind === "venue") return "Inside the OpenPoker salon";
  return `Inside ${place.door.label}`;
}

export interface WorldFocus {
  readonly placeKey: string;
  readonly placeText: string;
  readonly targetKey: string | null;
  readonly targetText: string | null;
}

function placeKeyOf(place: Place): string {
  return place.kind === "house" ? `house:${place.door.id}` : place.kind;
}

function targetKeyOf(t: Target | null): string | null {
  if (!t) return null;
  return t.kind === "house" ? `house:${t.door.id}` : `${t.kind}:${t.label}`;
}

export function worldFocus(place: Place, target: Target | null): WorldFocus {
  return Object.freeze({
    placeKey: placeKeyOf(place),
    placeText: placeAnnouncement(place),
    targetKey: targetKeyOf(target),
    targetText: targetAnnouncement(target),
  });
}

/**
 * What to announce going from `prev` to `next`: nothing on the first frame, a
 * place change before anything else, then a newly reached door. Walking away
 * from a door is silent (the region keeps no stale prompt to re-read).
 */
export function nextAnnouncement(prev: WorldFocus | null, next: WorldFocus): string | null {
  if (!prev) return null;
  if (prev.placeKey !== next.placeKey) return next.placeText;
  if (next.targetKey !== null && next.targetKey !== prev.targetKey) return next.targetText;
  return null;
}

export interface Announcement {
  readonly text: string;
  /** Bumped on every announce, so the region re-renders (and is re-read) for repeated text. */
  readonly seq: number;
}

export interface Announcer {
  get: () => Announcement;
  announce: (text: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createAnnouncer(): Announcer {
  let current: Announcement = Object.freeze({ text: "", seq: 0 });
  let listeners: ReadonlyArray<() => void> = [];
  return {
    get: () => current,
    announce: (text) => {
      const clean = text.trim();
      if (!clean) return;
      current = Object.freeze({ text: clean, seq: current.seq + 1 });
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}

/** The page's one announcer: other features (panels, chat) may announce through it too. */
export const announcer = createAnnouncer();
