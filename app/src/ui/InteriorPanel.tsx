import { useEffect, useState } from "react";
import { api } from "../net/api";
import type { HouseDoor } from "../scene/HouseDoors";

/** Neutral look: per-merchant interiors are no longer hard-coded (identity loads from the server). */
const interiorFor = (door: HouseDoor) => ({ colour: "#26333d", accent: door.trim, blurb: "A merchant interior." });

interface Builder {
  id: string;
  name: string;
  appUrl: string | null;
  offerings: { id: string; name: string; priceMinor: number; currency: string; appUrl: string | null }[];
}

export function InteriorPanel({ door, onExit }: { door: HouseDoor; onExit: () => void }) {
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const look = interiorFor(door);

  useEffect(() => {
    let alive = true;
    api
      .builders()
      .then((r) => {
        if (!alive) return;
        setBuilder(r.builders.find((b) => b.id === door.id) ?? null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "could not load"));
    return () => {
      alive = false;
    };
  }, [door.id]);

  return (
    <div className="interior" style={{ background: look.colour }}>
      <div className="interior__card" style={{ borderColor: look.accent }}>
        <header>
          <span className="interior__badge" style={{ background: look.accent }}>
            interior
          </span>
          <h2>{builder?.name ?? door.label}</h2>
          <p className="interior__owner">owner {door.owner}</p>
          <p className="interior__blurb">{look.blurb}</p>
        </header>

        {error && <p className="interior__error">{error}</p>}
        {!builder && !error && <p className="interior__hint">Loading the live catalogue…</p>}

        <ul className="interior__list">
          {(builder?.offerings ?? []).map((o) => (
            <li key={o.id}>
              <span>{o.name}</span>
              <span>
                {(o.priceMinor / 100).toFixed(2)} {o.currency}
              </span>
            </li>
          ))}
        </ul>

        {builder?.appUrl && (
          <a
            className="interior__app"
            style={{ background: look.accent }}
            href={builder.appUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {builder.name} app
          </a>
        )}

        <button type="button" className="interior__exit" onClick={onExit}>
          Exit to the plaza
        </button>
        <p className="interior__note">Listings are live from the server. Nothing is purchased here.</p>
      </div>
    </div>
  );
}