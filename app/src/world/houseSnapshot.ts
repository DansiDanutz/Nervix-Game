/**
 * P3/P4 hookup glue: the one house snapshot the house panel (InteriorCatalog
 * `onHouse`, re-sent after every load and owner save) shares with the 3D room
 * (ProductDisplays), which lives in the separate Canvas tree. Memory only.
 * Pure; the React hook is in useHouseSnapshot.ts.
 */

interface PropertyScoped {
  readonly propertyId: string;
}

export interface HouseSnapshotStore<H extends PropertyScoped> {
  get: () => H | null;
  set: (house: H | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createHouseSnapshotStore<H extends PropertyScoped>(): HouseSnapshotStore<H> {
  let current: H | null = null;
  let listeners: ReadonlyArray<() => void> = [];
  return {
    get: () => current,
    set: (house) => {
      if (house === current) return;
      current = house;
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

/** The snapshot only when it belongs to `propertyId`: a room never shows the last room's house. */
export function houseFor<H extends PropertyScoped>(house: H | null, propertyId: string): H | null {
  return house && house.propertyId === propertyId ? house : null;
}
