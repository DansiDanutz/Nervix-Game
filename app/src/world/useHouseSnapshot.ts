/**
 * The running client's house snapshot (houseSnapshot.ts): the house panel
 * (InteriorCatalog `onHouse`) writes it, the 3D room reads it, so 2D and 3D
 * show one server response and an owner's save re-lays the room at once.
 */
import { useSyncExternalStore } from "react";
import type { House } from "../net/api";
import { createHouseSnapshotStore, houseFor } from "./houseSnapshot";

export const houseSnapshot = createHouseSnapshotStore<House>();

/** The house the panel last loaded, only while it is the house with `propertyId`. */
export function useHouseSnapshot(propertyId: string): House | null {
  const house = useSyncExternalStore(houseSnapshot.subscribe, houseSnapshot.get, houseSnapshot.get);
  return houseFor(house, propertyId);
}
