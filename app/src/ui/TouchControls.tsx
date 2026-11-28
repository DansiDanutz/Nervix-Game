import { touch, resetTouch } from "../net/input";

const hold = (key: keyof typeof touch) => ({
  onPointerDown: () => {
    touch[key] = true;
  },
  onPointerUp: () => {
    touch[key] = false;
  },
  onPointerLeave: () => {
    touch[key] = false;
  },
});

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
  return (
    <div className="touch" aria-label="Movement controls">
      <div className="touch__pad">
        <button type="button" aria-label="Forward" {...hold("forward")}>
          ▲
        </button>
        <div className="touch__row">
          <button type="button" aria-label="Left" {...hold("left")}>
            ◀
          </button>
          <button type="button" aria-label="Back" {...hold("back")}>
            ▼
          </button>
          <button type="button" aria-label="Right" {...hold("right")}>
            ▶
          </button>
        </div>
      </div>
      <div className="touch__actions">
        {interior ? (
          <button type="button" onClick={onExit}>
            Exit
          </button>
        ) : (
          <button type="button" onClick={onEnter} disabled={!canEnter}>
            Enter
          </button>
        )}
      </div>
    </div>
  );
}

export function clearTouch() {
  resetTouch();
}