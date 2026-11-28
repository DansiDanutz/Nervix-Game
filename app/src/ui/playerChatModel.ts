/**
 * Keyboard rules for the place chat (CT3). Pure: the component works out
 * `typing` and `activatable` with the shared filters in input/keys.ts and
 * passes them in, so this module needs no DOM and no relative value imports.
 */
export type ChatKeyIntent = "focus" | "send" | "blur" | null;

export interface ChatKeyInput {
  readonly key: string;
  /** The event comes from the chat input itself. */
  readonly inChat: boolean;
  /** isTypingTarget(event.target). */
  readonly typing: boolean;
  /** isActivatableTarget(event.target): a focused control that owns Enter. */
  readonly activatable: boolean;
  /** False while a door or exit is in reach, so Enter keeps opening it. */
  readonly enterFocuses: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly repeat?: boolean;
  /** An IME composition is in progress (isComposing, or keyCode 229). */
  readonly composing?: boolean;
}

function inChatIntent(key: string, repeat: boolean): ChatKeyIntent {
  if (key === "escape") return "blur";
  return key === "enter" && !repeat ? "send" : null;
}

/** What a keydown does to the chat: T/Enter focus it from the world, Enter sends, Esc blurs. */
export function chatKeyIntent(input: ChatKeyInput): ChatKeyIntent {
  const key = input.key.toLowerCase();
  const repeat = input.repeat === true;
  if (input.inChat) return input.composing === true ? null : inChatIntent(key, repeat);
  if (input.typing || repeat) return null;
  if (input.metaKey || input.ctrlKey || input.altKey) return null;
  if (key === "t") return "focus";
  return key === "enter" && input.enterFocuses && !input.activatable ? "focus" : null;
}

/** The draft cut to `max` code points, the unit the server counts (maxLength counts UTF-16 units). */
export function capDraft(text: string, max: number): string {
  const points = [...text];
  return points.length > max ? points.slice(0, max).join("") : text;
}
