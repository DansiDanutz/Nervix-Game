/**
 * B3/B4 scene hookup: the world house directory (GET /world/houses, loaded
 * once per page) joined with the doors this layout has. Door labels and NPC
 * names come from the directory, never from client code.
 *
 * - The manifest has no runtime_layout.plots yet (B2), so the plaza and salon
 *   use the fallback doors (the Blender-built plaza house and the salon house),
 *   labelled from the directory; a door whose house is not listed (suspended,
 *   unverified, or the directory failed) is closed, and every door stays closed
 *   until the directory has loaded. targetAt re-runs on PlayerController's
 *   120 ms onPosition tick with the new directory, so no stale prompt survives.
 * - Street plots for runtime K2 houses and NPCs: manifest plots, minus those
 *   Blender already built and those on the spawn-to-fountain sightline.
 */
import { useEffect, useMemo, useState } from "react";
import { api, type WorldHouse } from "../net/api";
import type { HouseDoor } from "../scene/HouseDoors";
import { danggDoor, testBuilderDoor, type SliceLayout } from "../scene/slice";
import { joinHouseDirectory, loadWorldHouses, type SlicePlot } from "./houseDirectory";
import { builtPlotIds, clearOfSightline } from "./plotGuards";

export interface WorldDirectory {
  /** The directory; null until loaded, [] after a failure (every door closed). */
  readonly houses: readonly WorldHouse[] | null;
  readonly plazaDoors: readonly HouseDoor[];
  readonly salonDoors: readonly HouseDoor[];
  /** Plots runtime K2 houses and NPCs may stand on. */
  readonly streetPlots: readonly SlicePlot[];
  /** Plots Blender already built: never drawn twice. */
  readonly builtPlotIds: ReadonlySet<string>;
}

/** B2 pending: parseSliceManifest does not carry runtime_layout.plots yet. */
export const NO_PLOTS: readonly SlicePlot[] = Object.freeze([]);

export function worldDirectory(houses: readonly WorldHouse[] | null, layout: SliceLayout | null, plots: readonly SlicePlot[] = NO_PLOTS): WorldDirectory {
  const plazaFallback = [testBuilderDoor(layout)];
  const salonFallback = layout ? [danggDoor(layout)] : [];
  const plaza = joinHouseDirectory({ houses, plots, fallbackDoors: plazaFallback });
  // The salon house is reached inside the venue, never on a street plot.
  const salon = joinHouseDirectory({ houses, plots: NO_PLOTS, fallbackDoors: salonFallback });
  const arrival = layout?.plaza;
  const blenderDoors = arrival && layout ? [arrival.testBuilderDoor, layout.facadeDoor] : [];
  const fallbackIds = [...plazaFallback, ...salonFallback].map((d) => d.id);
  return Object.freeze({
    houses,
    plazaDoors: plaza.doors,
    salonDoors: salon.doors,
    streetPlots: arrival ? clearOfSightline(plots, arrival.spawn, arrival.fountain) : NO_PLOTS,
    builtPlotIds: builtPlotIds(plots, blenderDoors, fallbackIds),
  });
}

/** The directory entry of a house, or null when it is not listed. */
export function directoryHouse(directory: WorldDirectory, propertyId: string): WorldHouse | null {
  return directory.houses?.find((h) => h.propertyId === propertyId) ?? null;
}

export function useWorldDirectory(layout: SliceLayout | null): WorldDirectory {
  const [houses, setHouses] = useState<readonly WorldHouse[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadWorldHouses(api.worldHouses, (e) => console.error("[world] house directory unavailable; merchant doors closed", e)).then((list) => {
      if (live) setHouses(list);
    });
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => worldDirectory(houses, layout), [houses, layout]);
}
