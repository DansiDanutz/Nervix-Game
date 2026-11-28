import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { Place } from "../scene/slice";
import type { Target } from "../world/targets";
import { announcer, nextAnnouncement, worldFocus, type WorldFocus } from "../world/announce";
import { useMotionPreferenceAttribute } from "./useControlSettings";
import "./LiveRegion.css";

/** Announces place changes and newly reached doors ("Enter OpenPoker") through the announcer. */
function useAnnounceWorld(place: Place, target: Target | null) {
  const prev = useRef<WorldFocus | null>(null);
  useEffect(() => {
    const next = worldFocus(place, target);
    const text = nextAnnouncement(prev.current, next);
    prev.current = next;
    if (text) announcer.announce(text);
  }, [place, target]);
}

/**
 * Focus management after a place change: the control that had focus (a door
 * button, a house panel) is gone, so focus would fall to <body> with no cue.
 * Park it on the region's focus anchor instead, so the next Tab starts from
 * the top of the page and keys still reach the world.
 */
function useKeepFocusOnPlaceChange(place: Place, anchor: RefObject<HTMLSpanElement | null>) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) anchor.current?.focus({ preventScroll: true });
  }, [place, anchor]);
}

/** The polite, visually hidden region. A new `seq` re-renders the text so a repeat is read again. */
export function LiveRegion() {
  const { text, seq } = useSyncExternalStore(announcer.subscribe, announcer.get);
  return (
    <div className="a11y-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region" data-seq={seq}>
      <span key={seq}>{text}</span>
    </div>
  );
}

/** CT5 a11y layer: live region, focus anchor and the reduced-motion attribute. Mount once in App. */
export function A11yLayer({ place, target }: { place: Place; target: Target | null }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useMotionPreferenceAttribute();
  useAnnounceWorld(place, target);
  useKeepFocusOnPlaceChange(place, anchor);
  return (
    <>
      <span ref={anchor} tabIndex={-1} className="a11y-hidden" data-testid="focus-anchor" />
      <LiveRegion />
    </>
  );
}
