import { useEffect, useState } from "react";
import { api } from "../net/api";
import type { HouseDoor } from "../scene/HouseDoors";

interface Offering {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
}

/** Screen-space catalogue, resolved server-side from the property binding. */
export function InteriorCatalog({ door }: { door: HouseDoor }) {
  const [name, setName] = useState(door.label);
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const [items, setItems] = useState<Offering[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems([]);
    setAppUrl(null);
    setName(door.label);
    setError(null);
    setLoadedFor(null);
    api
      .house(door.propertyId)
      .then((r) => {
        if (!alive || loadedFor === door.propertyId) return;
        setName(r.house.ownerName);
        setAppUrl(r.house.appUrl);
        setItems(r.house.listings);
        setLoadedFor(door.propertyId);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "load failed"));
    return () => {
      alive = false;
    };
  }, [door.propertyId, door.label, loadedFor]);

  return (
    <div className="catalog-overlay" aria-label="Interior catalogue">
      <div className="catalog-overlay__head">
        <strong>{name}</strong>
        <small>owner {door.owner}</small>
      </div>
      {error && <p className="catalog-overlay__error">{error}</p>}
      {!loadedFor && !error && <p className="catalog-overlay__hint">Loading the owner's catalogue…</p>}
      <ul>
        {items.map((o) => (
          <li key={o.id}>
            <span>{o.name}</span>
            <span>
              {(o.priceMinor / 100).toFixed(2)} {o.currency}
            </span>
          </li>
        ))}
      </ul>
      {appUrl ? (
        <a href={appUrl} target="_blank" rel="noopener noreferrer">
          Open app
        </a>
      ) : (
        loadedFor && <p className="catalog-overlay__hint">No app bound to this owner.</p>
      )}
    </div>
  );
}