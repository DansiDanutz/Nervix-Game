/**
 * B4: which merchant houses MerchantHouses draws, and on which plot. Pure and
 * frozen; type-only shapes so Node tests it.
 */

interface PlotRef {
  readonly id: string;
}

interface HouseRef {
  readonly propertyId: string;
  readonly plotId: string;
}

export interface HouseOnPlot<H extends HouseRef, P extends PlotRef> {
  readonly house: H;
  readonly plot: P;
}

/**
 * Each house paired with its manifest plot, in house order. A house whose plot
 * is not in the manifest is skipped; plots in `builtPlotIds` (already modelled
 * in the Blender scene) are skipped too, so no plot is drawn twice.
 */
export function housesOnPlots<H extends HouseRef, P extends PlotRef>(
  houses: readonly H[],
  plots: readonly P[],
  builtPlotIds: ReadonlySet<string> = new Set(),
): readonly HouseOnPlot<H, P>[] {
  const byId = new Map(plots.map((p) => [p.id, p]));
  return Object.freeze(
    houses.flatMap((house) => {
      const plot = byId.get(house.plotId);
      return plot && !builtPlotIds.has(plot.id) ? [Object.freeze({ house, plot })] : [];
    }),
  );
}

/** The scene node name of a merchant house (E2E and debugging target). */
export const merchantHouseName = (propertyId: string) => `merchant_house_${propertyId}`;
