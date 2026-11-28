/**
 * Pure state for the AvatarPicker panel. Immutable: every event returns a new
 * state (or the same one when nothing changes).
 */
export interface PickerState {
  readonly status: "loading" | "ready" | "saving" | "error";
  /** The preset the server holds for this player. */
  readonly saved: string | null;
  /** The preset highlighted in the picker. */
  readonly chosen: string | null;
  readonly error: string | null;
}

export type PickerEvent =
  | { readonly type: "loaded"; readonly preset: string }
  | { readonly type: "choose"; readonly preset: string }
  | { readonly type: "save" }
  | { readonly type: "saved"; readonly preset: string }
  | { readonly type: "failed"; readonly error: string }
  | { readonly type: "retry" };

export const INITIAL_PICKER: PickerState = Object.freeze({ status: "loading", saved: null, chosen: null, error: null });

const settled = (preset: string): PickerState => Object.freeze({ status: "ready", saved: preset, chosen: preset, error: null });

function onFailed(state: PickerState, error: string): PickerState {
  // A failed load has nothing to keep; a failed save keeps the player's choice.
  if (state.saved === null) return Object.freeze({ ...state, status: "error", error });
  return Object.freeze({ ...state, status: "ready", error });
}

export type PickerReducer = (state: PickerState, event: PickerEvent) => PickerState;

export const createPickerReducer = (knownIds: readonly string[]): PickerReducer => (state, event) => {
  switch (event.type) {
    case "loaded":
    case "saved":
      return settled(event.preset);
    case "choose":
      if (!knownIds.includes(event.preset) || state.status !== "ready" || event.preset === state.chosen) return state;
      return Object.freeze({ ...state, chosen: event.preset, error: null });
    case "save":
      return canSave(state) ? Object.freeze({ ...state, status: "saving", error: null }) : state;
    case "failed":
      return onFailed(state, event.error);
    case "retry":
      // Only a failed load restarts; a failed save stays "ready" with its error.
      return state.status === "error" ? INITIAL_PICKER : state;
  }
};

export function canSave(state: PickerState): boolean {
  return state.status === "ready" && state.chosen !== null && state.chosen !== state.saved;
}

const NEXT_KEYS: readonly string[] = ["ArrowRight", "ArrowDown"];
const PREV_KEYS: readonly string[] = ["ArrowLeft", "ArrowUp"];

/** WAI-ARIA radio group keys: the preset a key moves to (wrapping), or null for other keys. */
export function radioKeyTarget(ids: readonly string[], current: string | null, key: string): string | null {
  if (ids.length === 0) return null;
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  const step = NEXT_KEYS.includes(key) ? 1 : PREV_KEYS.includes(key) ? -1 : 0;
  if (step === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return ids[0];
  return ids[(at + step + ids.length) % ids.length];
}

/** Roving tabindex: the chosen radio is the one tab stop, else the first. */
export function radioTabIndex(ids: readonly string[], chosen: string | null, id: string): 0 | -1 {
  const stop = chosen !== null && ids.includes(chosen) ? chosen : ids[0];
  return id === stop ? 0 : -1;
}
