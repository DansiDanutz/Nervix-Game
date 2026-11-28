/**
 * One keyboard filter for the whole client: game keys never fire while the
 * player types into a field, Enter on a focused control belongs to that
 * control, and held movement keys never stick. Pure and duck-typed, so it is
 * testable without a DOM.
 */
const TYPING_TAGS: readonly string[] = Object.freeze(["INPUT", "TEXTAREA", "SELECT"]);
/** Elements whose own Enter behaviour (click, follow, toggle) wins over the world. */
const ACTIVATABLE_TAGS: readonly string[] = Object.freeze(["BUTTON", "A", "SUMMARY"]);
const ACTIVATABLE_ROLES: readonly string[] = Object.freeze(["button", "link", "menuitem", "tab", "checkbox", "switch"]);

interface ElementLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  getAttribute?: (name: string) => string | null;
}

const asElement = (target: unknown): ElementLike | null => (target && typeof target === "object" ? (target as ElementLike) : null);

export function isTypingTarget(target: unknown): boolean {
  const el = asElement(target);
  if (!el) return false;
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === "string" && TYPING_TAGS.includes(el.tagName);
}

/** True for focused controls that handle Enter themselves (and for typing targets). */
export function isActivatableTarget(target: unknown): boolean {
  if (isTypingTarget(target)) return true;
  const el = asElement(target);
  if (!el) return false;
  if (typeof el.tagName === "string" && ACTIVATABLE_TAGS.includes(el.tagName)) return true;
  const role = typeof el.getAttribute === "function" ? el.getAttribute("role") : null;
  return role !== null && ACTIVATABLE_ROLES.includes(role);
}

/** Normalised key name: lower-case for letters and named keys alike. */
export function keyName(e: { key: string }): string {
  return e.key.toLowerCase();
}

export interface KeyEventLike {
  readonly key: string;
  readonly target?: unknown;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly repeat?: boolean;
}

/** The movement keys currently held. Never mutated: every change returns a new set. */
export type HeldKeys = ReadonlySet<string>;
export const EMPTY_KEYS: HeldKeys = new Set<string>();

const META = "meta";

/**
 * A key goes down. macOS never sends keyup for keys released while Meta is
 * held, so any Meta involvement clears everything instead of risking a stuck W.
 */
export function pressKey(held: HeldKeys, e: KeyEventLike): HeldKeys {
  if (isTypingTarget(e.target)) return held;
  const key = keyName(e);
  if (key === META || e.metaKey) return EMPTY_KEYS;
  if (held.has(key)) return held;
  return new Set([...held, key]);
}

/** A key comes up (wherever focus is, so a key held into a field still releases). */
export function releaseKey(held: HeldKeys, e: KeyEventLike): HeldKeys {
  const key = keyName(e);
  if (key === META) return EMPTY_KEYS;
  if (!held.has(key)) return held;
  return new Set([...held].filter((k) => k !== key));
}

export type ShellAction = "toggle-guide" | "close-panels" | "close-guide" | "leave-place" | "activate-target" | "collect-seal";

export interface ShellKeyInput extends KeyEventLike {
  /** A side panel or menu is open and visible (Esc closes it before anything else). */
  readonly panelsOpen: boolean;
  readonly atPlaza: boolean;
  /** A door or exit is in reach. */
  readonly hasTarget: boolean;
  readonly canCollectSeal: boolean;
}

const NONE: readonly ShellAction[] = Object.freeze([]);
const only = (...actions: ShellAction[]): readonly ShellAction[] => Object.freeze(actions);

function escapeActions(input: ShellKeyInput): readonly ShellAction[] {
  if (input.panelsOpen) return only("close-panels");
  // Holding Esc may close panels one by one, but never also closes the guide or leaves.
  if (input.repeat) return NONE;
  return input.atPlaza ? only("close-guide") : only("close-guide", "leave-place");
}

function useActions(key: string, input: ShellKeyInput): readonly ShellAction[] {
  if (input.repeat) return NONE;
  if (key === "enter" && isActivatableTarget(input.target)) return NONE;
  if (input.hasTarget) return only("activate-target");
  return key === "e" && input.canCollectSeal ? only("collect-seal") : NONE;
}

/** What one shell keydown does: G guide, Esc panels → guide → leave, E/Enter doors, E seals. */
export function shellKeyActions(input: ShellKeyInput): readonly ShellAction[] {
  if (isTypingTarget(input.target)) return NONE;
  if (input.metaKey || input.ctrlKey || input.altKey) return NONE;
  const key = keyName(input);
  if (key === "escape") return escapeActions(input);
  if (key === "g") return input.repeat ? NONE : only("toggle-guide");
  if (key === "e" || key === "enter") return useActions(key, input);
  return NONE;
}

interface VisibilitySource extends EventTarget {
  readonly visibilityState: string;
}

/**
 * Wires held movement keys to a window and document: typing never adds keys;
 * window blur, a hidden tab and any Meta press clear them. Returns the unbind.
 */
export function bindHeldKeys(win: EventTarget, doc: VisibilitySource, held: { current: HeldKeys }): () => void {
  const down = (e: Event) => {
    held.current = pressKey(held.current, e as unknown as KeyEventLike);
  };
  const up = (e: Event) => {
    held.current = releaseKey(held.current, e as unknown as KeyEventLike);
  };
  const clear = () => {
    held.current = EMPTY_KEYS;
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") clear();
  };
  win.addEventListener("keydown", down);
  win.addEventListener("keyup", up);
  win.addEventListener("blur", clear);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("keydown", down);
    win.removeEventListener("keyup", up);
    win.removeEventListener("blur", clear);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
