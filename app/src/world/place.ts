/**
 * The place seam: where the player is (plaza, the OpenPoker venue or a house),
 * the stable contract ids for places, and one small store the shell and the
 * scene can both read. Pure module: no React, no DOM.
 */
import type { Place } from "../scene/slice";

export type { Place };

export const PLAZA: Place = Object.freeze({ kind: "plaza" });

/** Mirrors shared/contracts/place-ids.json (v1, frozen); a test guards drift. */
export const KNOWN_PLACE_IDS: readonly string[] = Object.freeze([
  "plaza", "openpoker", "prop_dangg", "prop_test", "prop_unverified",
]);

export function isKnownPlaceId(id: unknown): id is string {
  return typeof id === "string" && KNOWN_PLACE_IDS.includes(id);
}

/** DOM and test-hook key (`data-place`, `__nervixPlace`): plaza, venue or house:<doorId>. */
export function placeKey(place: Place): string {
  return place.kind === "house" ? `house:${place.door.id}` : place.kind;
}

/** Shared contract id (presence rooms, plots): plaza, openpoker or the house's propertyId. */
export function placeId(place: Place): string {
  if (place.kind === "house") return place.door.propertyId;
  return place.kind === "venue" ? place.id : "plaza";
}

export interface PlaceStore {
  get: () => Place;
  set: (next: Place) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPlaceStore(initial: Place = PLAZA): PlaceStore {
  let current = initial;
  let listeners: ReadonlyArray<() => void> = [];
  return {
    get: () => current,
    set: (next) => {
      if (next === current) return;
      current = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}

/** The one place store for the running client. */
export const placeStore = createPlaceStore();

/**
 * Back to the plaza. App calls this once on mount, so a dev HMR remount (which
 * resets layout and spawn) cannot keep a stale place; on a real page load the
 * store is already on the plaza and this is a no-op.
 */
export function resetPlace(store: PlaceStore = placeStore): void {
  store.set(PLAZA);
}
