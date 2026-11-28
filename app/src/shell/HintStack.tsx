import type { Place } from "../world/place";
import { placeKey } from "../world/place";
import { placeLabel, type Target } from "../world/targets";

/** One stacked hint region: the place/controls hint and the privacy note never overlap. */
export function HintStack({ place, target, settled }: { place: Place; target: Target | null; settled: boolean }) {
  const prompt = target ? `E / Enter or click · ${target.kind === "exit" ? "Return to the plaza" : `Enter ${target.label}`}` : placeLabel(place);
  return (
    <div className="hint-stack" data-testid="hint-stack">
      <div className={`place-hint${settled && !target ? " is-faded" : ""}`} data-testid="place-hint" data-place={placeKey(place)}>
        {prompt}
      </div>
      {place.kind !== "house" && <div className={`controls-hint${settled ? " is-faded" : ""}`} data-testid="controls-hint">Merchant conversations are private</div>}
    </div>
  );
}
