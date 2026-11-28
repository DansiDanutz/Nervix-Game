/**
 * Player chat inside one place (CT3), client side. The server owns the rules
 * (server/src/presence-chat.mjs): it cleans, caps, moderates, rate-limits and
 * echoes an accepted line to the sender's room, keeping nothing. This side
 * mirrors the cheap checks, keeps a short in-memory log for the current place
 * and derives speech bubbles for the scene. Player chat only: merchant
 * conversations never pass through here. Pure module with no relative value
 * imports, so `node --test` loads it as is.
 */

export const SAY_MAX_CHARS = 140;
/** Lines kept in memory for the on-screen log; cleared on a place change and never stored. */
export const LOG_MAX = 30;
/** How long a speech bubble stays over a speaker. */
export const BUBBLE_MS = 6000;

export interface ChatLine {
  readonly key: string;
  /** Opaque presence handle of the speaker. */
  readonly from: string;
  readonly name: string;
  readonly text: string;
  readonly self: boolean;
  readonly at: number;
}

export interface ChatState {
  readonly place: string;
  readonly lines: readonly ChatLine[];
  readonly notice: string | null;
  /** Monotonic line counter for unique keys. */
  readonly count: number;
}

export interface Bubble {
  readonly playerId: string;
  readonly self: boolean;
  readonly name: string;
  readonly text: string;
  readonly expiresAt: number;
}

export type SayResult = { readonly ok: true } | { readonly ok: false; readonly reason: "offline" | "empty" | "too long" };

const LINE_BREAKS = /[\t\n\r\v\f]/g;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu;

const NOTICES: Readonly<Record<string, string>> = Object.freeze({
  "too long": `That line is too long (${SAY_MAX_CHARS} characters at most).`,
  empty: "Type something first.",
  moderated: "That line is not allowed here.",
  "rate limited": "Slow down a little before the next line.",
  "wrong place": "You moved before that line was sent; say it again here.",
  offline: "Chat is offline right now.",
});
const FALLBACK_NOTICE = "Your line was not sent.";

export const noticeFor = (reason: string): string => NOTICES[reason] ?? FALLBACK_NOTICE;

/** The same cleaning the server applies: printable, single-spaced, trimmed. */
export function cleanSay(text: string): string {
  if (typeof text !== "string") return "";
  return text.normalize("NFKC").replace(LINE_BREAKS, " ").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

export function sayMessage(text: string, place: string) {
  return { type: "say" as const, text: cleanSay(text), place };
}

export function emptyChat(place: string): ChatState {
  return Object.freeze({ place, lines: Object.freeze([]), notice: null, count: 0 });
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function appendLine(state: ChatState, frame: Record<string, unknown>, selfHandle: string | null, now: number): ChatState {
  const { id, name, text } = frame as { id: string; name: unknown; text: string };
  const self = selfHandle !== null && id === selfHandle;
  const line: ChatLine = Object.freeze({
    key: `${state.place}:${state.count}`, from: id, name: typeof name === "string" ? name : "", text, self, at: now,
  });
  return Object.freeze({
    ...state,
    lines: Object.freeze([...state.lines, line].slice(-LOG_MAX)),
    notice: self ? null : state.notice,
    count: state.count + 1,
  });
}

/** The chat after one server frame. Lines for another place and malformed frames change nothing. */
export function receiveChatFrame(state: ChatState, frame: unknown, selfHandle: string | null, now: number): ChatState {
  if (!isRecord(frame)) return state;
  if (frame.type === "say-rejected") return Object.freeze({ ...state, notice: noticeFor(String(frame.reason ?? "")) });
  if (frame.type !== "say" || frame.place !== state.place) return state;
  if (!isText(frame.id) || !isText(frame.text)) return state;
  return appendLine(state, frame, selfHandle, now);
}

/** Each speaker's latest unexpired line, oldest first. For the scene's speech bubbles. */
export function bubblesOf(state: ChatState, now: number): readonly Bubble[] {
  const latest = new Map<string, ChatLine>();
  for (const line of state.lines) {
    if (line.at + BUBBLE_MS > now) {
      latest.delete(line.from);
      latest.set(line.from, line);
    }
  }
  return Object.freeze([...latest.values()].map((l) => Object.freeze({
    playerId: l.from, self: l.self, name: l.name, text: l.text, expiresAt: l.at + BUBBLE_MS,
  })));
}

type Sender = (frame: ReturnType<typeof sayMessage>) => void;

export interface ChatStore {
  get: () => ChatState;
  subscribe: (listener: () => void) => () => void;
  receive: (frame: unknown, selfHandle: string | null, now: number) => void;
  /** A new place starts an empty log; the same place keeps it. */
  enterPlace: (place: string) => void;
  /** The live socket's sender while connected, null while offline. */
  setSender: (sender: Sender | null) => void;
  say: (text: string) => SayResult;
}

export function createChatStore(initialPlace: string): ChatStore {
  let state = emptyChat(initialPlace);
  let listeners: ReadonlyArray<() => void> = [];
  let sender: Sender | null = null;

  const set = (next: ChatState) => {
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
  };
  const refuse = (reason: "offline" | "empty" | "too long"): SayResult => {
    set(Object.freeze({ ...state, notice: noticeFor(reason) }));
    return Object.freeze({ ok: false, reason });
  };

  return Object.freeze({
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    receive: (frame: unknown, selfHandle: string | null, now: number) => set(receiveChatFrame(state, frame, selfHandle, now)),
    enterPlace: (place: string) => {
      if (place !== state.place) set(emptyChat(place));
    },
    setSender: (next: Sender | null) => {
      sender = next;
    },
    say: (text: string): SayResult => {
      const frame = sayMessage(text, state.place);
      if (frame.text.length === 0) return refuse("empty");
      if ([...frame.text].length > SAY_MAX_CHARS) return refuse("too long");
      if (!sender) return refuse("offline");
      sender(frame);
      return Object.freeze({ ok: true });
    },
  });
}
