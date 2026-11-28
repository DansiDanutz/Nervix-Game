import { useEffect, useSyncExternalStore, type PointerEvent } from "react";
import { isHeld, pressTouch, releaseAllTouch, releaseTouch, resetTouch, toggleTouchRun, touchPad } from "../net/input";
import { MOVE_ROWS, TURN_BUTTONS, padClassName, touchAction, type PadButtonSpec } from "./touchControlsModel";
import "./TouchControls.css";

/**
 * Capture keeps pointerup/pointercancel on the button even when the finger
 * slides off. Capture can fail for a pointer that already ended (or a
 * synthetic test event); the hold still releases on pointerup/pointercancel.
 */
function capture(e: PointerEvent<HTMLButtonElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch (err) {
    if (import.meta.env.DEV) console.debug("touch pad: pointer capture unavailable", err);
  }
}

function HoldButton({ button, held }: { button: PadButtonSpec; held: boolean }) {
  const release = (e: PointerEvent<HTMLButtonElement>) => releaseTouch(e.pointerId);
  return (
    <button
      type="button"
      aria-label={button.label}
      data-held={held ? "true" : undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        capture(e);
        pressTouch(e.pointerId, button.id);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}>
      {button.glyph}
    </button>
  );
}

/** Blur or a hidden tab lets go of every held button; leaving the world resets the pad. */
function useReleaseOnHide() {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAllTouch();
    };
    window.addEventListener("blur", releaseAllTouch);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", releaseAllTouch);
      document.removeEventListener("visibilitychange", onVisibility);
      resetTouch();
    };
  }, []);
}

/** Always-mounted touch pad (CT4): D-pad, turn buttons, a run toggle and the door action. */
export function TouchControls({
  interior,
  canEnter,
  onEnter,
  onExit,
}: {
  interior: boolean;
  canEnter: boolean;
  onEnter: () => void;
  onExit: () => void;
}) {
  const pad = useSyncExternalStore(touchPad.subscribe, touchPad.get, touchPad.get);
  const action = touchAction(interior, canEnter);
  useReleaseOnHide();
  return (
    <div className={padClassName(action)} role="group" aria-label="Movement controls" data-testid="touch-controls">
      <div className="touchpad__dpad">
        {MOVE_ROWS.map((row) => (
          <div className="touchpad__row" key={row[0].id}>
            {row.map((b) => <HoldButton key={b.id} button={b} held={isHeld(pad, b.id)} />)}
          </div>
        ))}
      </div>
      <div className="touchpad__side">
        <div className="touchpad__row">
          {TURN_BUTTONS.map((b) => <HoldButton key={b.id} button={b} held={isHeld(pad, b.id)} />)}
        </div>
        <div className="touchpad__row">
          <button type="button" className="touchpad__run" aria-pressed={pad.run} onClick={toggleTouchRun}>
            Run
          </button>
          {action === "exit" && (
            <button type="button" className="touchpad__action" onClick={onExit}>
              Exit
            </button>
          )}
          {action === "enter" && (
            <button type="button" className="touchpad__action" onClick={onEnter}>
              Enter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function clearTouch() {
  resetTouch();
}
