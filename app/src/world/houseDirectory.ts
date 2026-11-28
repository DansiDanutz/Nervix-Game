/**
 * B3: joins the world directory (GET /world/houses) with the plots the slice
 * manifest carries (runtime_layout.plots[], from B2) into the doors the scene
 * draws. Pure: no React, no runtime imports, inputs never mutated.
 *
 * - With manifest plots: one door per listed house whose plot is in the
 *   manifest, in manifest order; plots without a house are closed; listed
 *   houses with no manifest plot (e.g. the salon house) are unplaced.
 * - Without manifest plots: the legacy door list, kept only for listed
 *   houses and labelled from the directory.
 * - Directory not loaded yet (null): every door and every plot closed (fail closed).
 * - Directory failed to load: pass [] (loadWorldHouses does), so every door is
 *   closed. Fail closed: a suspended merchant's door never shows on an error.
 */
import type { HouseDoor } from "../scene/HouseDoors";
import type { WorldHouse } from "../net/api/world";

/** One entry of runtime_layout.plots[] (B2): a door empty plot_<district>_<n>. */
export interface SlicePlot {
  /** Equals the seeded plots.id row. */
  readonly id: string;
  /** Plaza-side threshold; stepping back = +sin(yaw), +cos(yaw). */
  readonly door: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly sizeClass: string;
  /** Unit vector pointing from the facade into the street. */
  readonly outward: { readonly x: number; readonly z: number };
}

export interface HouseDirectoryInput {
  readonly houses: readonly WorldHouse[] | null;
  readonly plots?: readonly SlicePlot[] | null;
  readonly fallbackDoors: readonly HouseDoor[];
}

export interface HouseDirectoryView {
  readonly doors: readonly HouseDoor[];
  /** Manifest plot ids with no listed house: drawn closed, never enterable. */
  readonly closedPlots: readonly string[];
  /** Listed property ids with no door in this layout. */
  readonly unplaced: readonly string[];
}

const uniquePlots = (plots: readonly SlicePlot[]) => plots.filter((p, i) => plots.findIndex((o) => o.id === p.id) === i);

function plotDoor(plot: SlicePlot, house: WorldHouse): HouseDoor {
  const door: HouseDoor = {
    id: plot.id,
    propertyId: house.propertyId,
    owner: "",
    label: house.merchantName,
    position: [plot.door.x, 0, plot.door.z],
    colour: house.accent,
    trim: house.accent,
    yaw: plot.door.yaw,
  };
  return Object.freeze(door);
}

function view(doors: readonly HouseDoor[], closedPlots: readonly string[], unplaced: readonly string[]): HouseDirectoryView {
  return Object.freeze({ doors: Object.freeze([...doors]), closedPlots: Object.freeze([...closedPlots]), unplaced: Object.freeze([...unplaced]) });
}

function joinPlots(houses: readonly WorldHouse[], plots: readonly SlicePlot[]): HouseDirectoryView {
  const byPlot = new Map(houses.map((h) => [h.plotId, h]));
  const doors = plots.flatMap((p) => (byPlot.has(p.id) ? [plotDoor(p, byPlot.get(p.id)!)] : []));
  const placed = new Set(plots.map((p) => p.id));
  return view(doors, plots.filter((p) => !byPlot.has(p.id)).map((p) => p.id), houses.filter((h) => !placed.has(h.plotId)).map((h) => h.propertyId));
}

function joinFallback(houses: readonly WorldHouse[], fallbackDoors: readonly HouseDoor[]): HouseDirectoryView {
  const byProperty = new Map(houses.map((h) => [h.propertyId, h]));
  const doors = fallbackDoors.flatMap((d) => {
    const h = byProperty.get(d.propertyId);
    return h ? [Object.freeze({ ...d, label: h.merchantName })] : [];
  });
  const placed = new Set(fallbackDoors.map((d) => d.propertyId));
  return view(doors, [], houses.filter((h) => !placed.has(h.propertyId)).map((h) => h.propertyId));
}

export function joinHouseDirectory({ houses, plots, fallbackDoors }: HouseDirectoryInput): HouseDirectoryView {
  const usable = uniquePlots(plots ?? []);
  // Not loaded yet: fail closed, so an unlisted (suspended, unverified) merchant's door is never enterable.
  if (houses === null) return view([], usable.map((p) => p.id), []);
  return usable.length ? joinPlots(houses, usable) : joinFallback(houses, fallbackDoors);
}

/** Fetches the directory; any fetch or parse error yields [] so every door closes. Never rejects. */
export async function loadWorldHouses(
  fetchHouses: () => Promise<readonly WorldHouse[]>,
  onError?: (error: unknown) => void,
): Promise<readonly WorldHouse[]> {
  try {
    return await fetchHouses();
  } catch (error) {
    onError?.(error);
    return Object.freeze([]);
  }
}
