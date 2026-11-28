import { useEffect, useState } from "react";

/** Idle bottom hints fade after this long on arrival (ms). */
const HINT_FADE_MS = 6000;

/**
 * The bottom hints sit over the foreground compass-rose medallion: fade them after the first
 * input or a few seconds, whichever comes first. A new place shows its name again.
 */
export function useHintsSettled(entered: boolean, placeKey: string): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => setSettled(false), [placeKey]);
  useEffect(() => {
    if (!entered || settled) return;
    const settle = () => setSettled(true);
    const timer = window.setTimeout(settle, HINT_FADE_MS);
    window.addEventListener("keydown", settle);
    window.addEventListener("pointerdown", settle);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", settle);
      window.removeEventListener("pointerdown", settle);
    };
  }, [entered, settled]);
  return settled;
}
