import type { EscapeStack } from "./escapeLayers";
import type { KeyEventLike, ShellKeyInput } from "./keys";

/** What the shell knows when a key goes down, apart from the event itself. */
export interface ShellState {
  readonly placeKind: string;
  readonly hasTarget: boolean;
  readonly canCollectSeal: boolean;
}

/**
 * The input to `shellKeyActions` for one keydown. Open panels come only from
 * visible registered layers, never from the place, so a house-only panel holds
 * Esc back inside a house and a hidden side column does not.
 */
export function shellInput(e: KeyEventLike, state: ShellState, stack: Pick<EscapeStack, "hasOpen">): ShellKeyInput {
  return Object.freeze({
    key: e.key, target: e.target, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat,
    panelsOpen: stack.hasOpen(),
    atPlaza: state.placeKind === "plaza",
    hasTarget: state.hasTarget,
    canCollectSeal: state.canCollectSeal,
  });
}
