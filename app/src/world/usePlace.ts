import { useSyncExternalStore } from "react";
import { placeStore, type Place } from "./place";

/** Read the current place from the shared place store (shell or scene). */
export function usePlace(): Place {
  return useSyncExternalStore(placeStore.subscribe, placeStore.get);
}
