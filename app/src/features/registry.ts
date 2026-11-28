/**
 * Feature registration point. A milestone adds a panel by registering a
 * Feature here (one line in features/index), never by editing App.tsx.
 * Registries are immutable: register returns a new one.
 */
export type Slot = "side" | "overlay";

export interface Feature<Ctx, Out> {
  readonly id: string;
  readonly slot: Slot;
  /** Lower comes first within a slot; ties keep registration order. */
  readonly order: number;
  readonly render: (ctx: Ctx) => Out;
}

export interface Registry<Ctx, Out> {
  readonly features: readonly Feature<Ctx, Out>[];
}

const ID = /^[a-z][a-z0-9-]*$/;

export function createRegistry<Ctx, Out>(): Registry<Ctx, Out> {
  return Object.freeze({ features: Object.freeze([]) });
}

export function register<Ctx, Out>(registry: Registry<Ctx, Out>, feature: Feature<Ctx, Out>): Registry<Ctx, Out> {
  if (!ID.test(feature.id)) throw new Error(`invalid feature id: ${JSON.stringify(feature.id)}`);
  if (!Number.isFinite(feature.order)) throw new Error(`invalid feature order for ${feature.id}`);
  if (registry.features.some((f) => f.id === feature.id)) throw new Error(`duplicate feature id: ${feature.id}`);
  return Object.freeze({ features: Object.freeze([...registry.features, Object.freeze({ ...feature })]) });
}

export function featuresIn<Ctx, Out>(registry: Registry<Ctx, Out>, slot: Slot): readonly Feature<Ctx, Out>[] {
  // Array.prototype.sort is stable, so equal orders keep registration order.
  return registry.features.filter((f) => f.slot === slot).sort((a, b) => a.order - b.order);
}
