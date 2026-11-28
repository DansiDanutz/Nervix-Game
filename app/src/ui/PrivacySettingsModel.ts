/**
 * Pure state for the PrivacySettings panel (C9). Immutable: every event
 * returns a new state, or the same one when nothing changes.
 */
import type { PrivacySettings } from "../net/api/privacy";

export type PrivacyKey = keyof PrivacySettings;

export interface PrivacyPanelState {
  readonly status: "loading" | "ready" | "saving" | "error";
  /** The settings the server holds for this player. */
  readonly saved: PrivacySettings | null;
  /** The settings shown in the panel. */
  readonly chosen: PrivacySettings | null;
  readonly error: string | null;
}

export type PrivacyPanelEvent =
  | { readonly type: "loaded"; readonly settings: PrivacySettings }
  | { readonly type: "toggle"; readonly key: PrivacyKey }
  | { readonly type: "save" }
  | { readonly type: "saved"; readonly settings: PrivacySettings }
  | { readonly type: "failed"; readonly error: string }
  | { readonly type: "retry" };

export const INITIAL_PRIVACY_PANEL: PrivacyPanelState = Object.freeze({ status: "loading", saved: null, chosen: null, error: null });

const copy = ({ hideName, anonymous }: PrivacySettings): PrivacySettings => Object.freeze({ hideName, anonymous });
const same = (a: PrivacySettings | null, b: PrivacySettings | null) =>
  a !== null && b !== null && a.hideName === b.hideName && a.anonymous === b.anonymous;

const settled = (settings: PrivacySettings): PrivacyPanelState =>
  Object.freeze({ status: "ready", saved: copy(settings), chosen: copy(settings), error: null });

export const canSavePrivacy = (s: PrivacyPanelState) => s.status === "ready" && s.chosen !== null && !same(s.chosen, s.saved);

function toggle(state: PrivacyPanelState, key: PrivacyKey): PrivacyPanelState {
  if (state.status !== "ready" || state.chosen === null) return state;
  return Object.freeze({ ...state, chosen: Object.freeze({ ...state.chosen, [key]: !state.chosen[key] }), error: null });
}

function failed(state: PrivacyPanelState, error: string): PrivacyPanelState {
  // A failed load has nothing to keep; a failed save keeps the player's choice.
  if (state.saved === null) return Object.freeze({ ...state, status: "error", error });
  return Object.freeze({ ...state, status: "ready", error });
}

export function privacyPanelReducer(state: PrivacyPanelState, event: PrivacyPanelEvent): PrivacyPanelState {
  switch (event.type) {
    case "loaded":
    case "saved":
      return settled(event.settings);
    case "toggle":
      return toggle(state, event.key);
    case "save":
      return canSavePrivacy(state) ? Object.freeze({ ...state, status: "saving", error: null }) : state;
    case "failed":
      return failed(state, event.error);
    case "retry":
      return state.status === "error" ? INITIAL_PRIVACY_PANEL : state;
  }
}
