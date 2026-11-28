/**
 * Open UI layers that Esc closes before it leaves a place (side menu, panels).
 * A layer registers while it is open; Esc closes the most recent one that is
 * visible right now. A layer whose container is hidden (for example the side
 * column inside a house) never holds Esc back, whatever the place.
 */
export interface EscapeStack {
  /** Register an open layer; returns its release (call on close or unmount). */
  push: (close: () => void, isVisible?: () => boolean) => () => void;
  hasOpen: () => boolean;
  /** Close the most recently opened visible layer; false when none is open. */
  closeTop: () => boolean;
}

interface Layer {
  readonly close: () => void;
  readonly isVisible: () => boolean;
}

const ALWAYS_VISIBLE = () => true;

export function createEscapeStack(): EscapeStack {
  let layers: readonly Layer[] = Object.freeze([]);
  const release = (layer: Layer) => {
    layers = Object.freeze(layers.filter((l) => l !== layer));
  };
  const visible = () => layers.filter((l) => l.isVisible());
  return Object.freeze({
    push: (close: () => void, isVisible: () => boolean = ALWAYS_VISIBLE) => {
      const layer: Layer = Object.freeze({ close, isVisible });
      layers = Object.freeze([...layers, layer]);
      return () => release(layer);
    },
    hasOpen: () => visible().length > 0,
    closeTop: () => {
      const top = visible().at(-1);
      if (!top) return false;
      release(top);
      top.close();
      return true;
    },
  });
}

/** The one escape stack for the running client. */
export const escapeLayers = createEscapeStack();
