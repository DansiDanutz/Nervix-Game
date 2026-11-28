import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type House } from "../net/api";
import type { HouseDoor } from "../scene/HouseDoors";
import { HouseEditor } from "./HouseEditor";
import { ProductCard, useSelectedProduct } from "./ProductCard";
import { findCardListing, productSelection, type CardListing } from "./ProductCardModel";

/**
 * Screen-space house panel. Identity, welcome, decor and catalog are resolved
 * server-side from the property binding at runtime; nothing is baked into the
 * scene. Edit controls appear only when the server says canEdit, and every
 * write is re-checked by the server anyway. Clicking a product in the room
 * (ProductDisplays onSelect) or a listing name here opens a read-only card.
 */
export function InteriorCatalog({ door, onHouse }: { door: HouseDoor; onHouse?: (h: House | null) => void }) {
  const [house, setHouse] = useState<House | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .house(door.propertyId)
      .then((r) => {
        if (!alive) return;
        setHouse(r.house);
        setCanEdit(r.canEdit);
        setError(null);
        onHouse?.(r.house);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError ? `${e.code}: ${e.message}` : "load failed");
        // Fail closed: the 3D room must not keep drawing a previous visit's listings.
        onHouse?.(null);
      });
    return () => {
      alive = false;
    };
  }, [door.propertyId, onHouse]);

  useEffect(() => {
    setHouse(null);
    setCanEdit(false);
    return load();
  }, [load]);

  // A selection never outlives the house it was made in.
  useEffect(() => () => productSelection.clear(), [door.propertyId]);
  // Nor does the shared house snapshot the 3D room reads (useHouseSnapshot).
  useEffect(() => () => onHouse?.(null), [door.propertyId, onHouse]);
  const selectedId = useSelectedProduct(door.propertyId);

  const profile = house?.profile;
  const featured = new Set(profile?.display.featuredListingIds ?? []);
  const listings = [...(house?.listings ?? [])].sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));
  const showApp = profile?.display.showApp !== false;
  const accent = profile?.decor.accent ?? door.trim;
  const selected = findCardListing((house?.listings ?? []) as readonly CardListing[], selectedId);

  return (
    <div className="catalog-overlay" aria-label="House panel" data-testid="house-panel" style={{ borderColor: accent }}>
      <div className="catalog-overlay__head">
        <strong data-testid="house-name">{house?.merchantName ?? house?.ownerName ?? door.label}</strong>
        <small>
          {house?.merchantVerified ? "Verified NervixPay merchant" : house ? "Merchant not verified" : "…"}
          {" · "}
          {canEdit ? "you own this house" : "visitor · read-only"}
        </small>
      </div>
      {error && <p className="catalog-overlay__error" role="alert">{error}</p>}
      {!house && !error && <p className="catalog-overlay__hint">Loading the owner's house…</p>}
      {profile?.welcome && <p className="catalog-overlay__welcome" data-testid="house-welcome">{profile.welcome}</p>}
      <ul>
        {listings.map((o) => (
          <li key={o.id} className={featured.has(o.id) ? "is-featured" : undefined}>
            <button type="button" className="catalog-overlay__view" onClick={() => productSelection.select(door.propertyId, o.id)} aria-label={`View ${o.name}`}>
              {o.name}
            </button>
            <span>
              {(o.priceMinor / 100).toFixed(2)} {o.currency}
            </span>
          </li>
        ))}
      </ul>
      {selected && <ProductCard listing={selected} onClose={productSelection.clear} />}
      {showApp && house?.appUrl && (
        <a href={house.appUrl} target="_blank" rel="noopener noreferrer">
          Open app
        </a>
      )}
      {profile?.websiteUrl && (
        <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer">
          Visit website
        </a>
      )}
      <p className="catalog-overlay__hint">Demo listings · nothing is purchased here.</p>
      {canEdit && house && <HouseEditor house={house} onSaved={load} />}
    </div>
  );
}
