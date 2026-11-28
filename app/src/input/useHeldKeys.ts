import { useEffect, useRef, type MutableRefObject } from "react";
import { bindHeldKeys, EMPTY_KEYS, type HeldKeys } from "./keys";

/**
 * The movement keys held right now, read by the frame loop. Typing never adds
 * keys; window blur, a hidden tab and any Meta press clear them, so no key sticks.
 */
export function useHeldKeys(): MutableRefObject<HeldKeys> {
  const held = useRef<HeldKeys>(EMPTY_KEYS);
  useEffect(() => bindHeldKeys(window, document, held), []);
  return held;
}
