import type { Marker } from "../scene/CityScene";

const LANDMARKS: Record<string, { name: string; hint: string }> = {
  "slot-01": { name: "Merchant House", hint: "Two storeys, a balcony and a teal awning; the shop sign hangs over the door." },
  "slot-02": { name: "Café", hint: "Teal awning, tables on the pavement and the smell of coffee; the counter is inside." },
  "slot-03": { name: "Casino", hint: "Three tall arches and a flight of steps; the widest doorway in the city." },
};

function compass(dx: number, dz: number) {
  if (Math.abs(dx) < 2 && Math.abs(dz) < 2) return "at the fountain";
  const ns = dz > 0 ? "north" : "south";
  const ew = dx > 0 ? "east" : "west";
  if (Math.abs(dx) < 2) return ns;
  if (Math.abs(dz) < 2) return ew;
  return `${ns}-${ew}`;
}

export function GuidePanel({ markers, onClose }: { markers: Marker[]; onClose: () => void }) {
  const buildings = markers.filter((m) => m.kind === "building");

  return (
    <section className="panel guide" aria-label="District guide">
      <header className="panel__head">
        <strong>District guide</strong>
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close guide">
          Close
        </button>
      </header>

      <ul className="guide__list">
        {buildings.map((b) => {
          const info = LANDMARKS[b.slot ?? ""] ?? { name: b.id, hint: "A merchant property." };
          // manifest positions are Blender world (x, y=depth, z=height)
          const where = compass(b.position[0], b.position[1]);
          return (
            <li key={b.id} className="guide__row">
              <span className="guide__name">{info.name}</span>
              <span className="guide__where">{where}</span>
              <span className="guide__hint">{info.hint}</span>
            </li>
          );
        })}
      </ul>

      <p className="panel__hint">Press G to toggle · Esc to close · walking stays active</p>
    </section>
  );
}