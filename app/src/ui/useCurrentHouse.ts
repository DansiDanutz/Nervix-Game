import { useEffect, useMemo, useState } from "react";
import { api } from "../net/api";
import { usePlace } from "../world/usePlace";
import { houseTarget, type HouseTarget, type HouseView } from "./talkToMerchantModel";

export interface CurrentHouse {
  readonly target: HouseTarget | null;
  readonly view: HouseView | null;
  readonly error: string | null;
}

/**
 * The house the player stands in (from the place store) and what the server
 * says about it for this viewer. Re-fetched when the property or user changes.
 */
export function useCurrentHouse(userId: string | null): CurrentHouse {
  const place = usePlace();
  const target = useMemo(() => houseTarget(place), [place]);
  const propertyId = target?.propertyId ?? null;
  const [loaded, setLoaded] = useState<{ key: string; view: HouseView | null; error: string | null } | null>(null);
  const key = `${propertyId ?? ""}|${userId ?? ""}`;

  useEffect(() => {
    if (!propertyId || !userId) return;
    let alive = true;
    api
      .house(propertyId)
      .then((r) => alive && setLoaded({ key, view: Object.freeze({ house: r.house, canEdit: r.canEdit }), error: null }))
      .catch((e) => alive && setLoaded({ key, view: null, error: e instanceof Error ? e.message : "could not load the house" }));
    return () => {
      alive = false;
    };
  }, [key, propertyId, userId]);

  const current = loaded?.key === key ? loaded : null;
  return { target, view: current?.view ?? null, error: current?.error ?? null };
}
