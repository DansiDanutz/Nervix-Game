import { useContext, useEffect, useRef } from "react";
import { escapeLayers } from "./escapeLayers";
import { EscapeVisibility } from "./escapeVisibility";

/**
 * While `open`, Esc closes this layer (calls `close`) before it leaves the place.
 * Visibility (read at key time) comes from `isVisible`, else from the nearest
 * EscapeVisibility provider, so a layer in a hidden container never holds Esc back.
 */
export function useEscapeLayer(open: boolean, close: () => void, isVisible?: () => boolean) {
  const inherited = useContext(EscapeVisibility);
  const closeRef = useRef(close);
  closeRef.current = close;
  const visibleRef = useRef(isVisible ?? inherited);
  visibleRef.current = isVisible ?? inherited;
  useEffect(() => (open ? escapeLayers.push(() => closeRef.current(), () => visibleRef.current()) : undefined), [open]);
}
