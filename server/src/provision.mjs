/**
 * Idempotent merchant property provisioning.
 *
 * A merchant gets exactly one property and one AI employee. Retries, refreshes
 * and repeated logins must never create a second property. Slots are stable and
 * assigned from the Blender-authored district; no Blender run is needed at
 * signup. Plots live in the database (migration 017).
 */

import { createHash } from "node:crypto";

export const ALLOCATION = Object.freeze({
  user: { property: null, agent: false },
  merchant: { property: "merchant_house", agent: true },
  cafe: { property: "cafe_shop", agent: true },
  gaming: { property: "casino_venue", agent: true },
});

export class ProvisioningError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProvisioningError";
  }
}

function stableId(prefix, userId) {
  const digest = createHash("sha256").update(`nervix:${userId}`).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

/** The allocation for a business type; throws for an unknown one. */
export function allocationFor(businessType) {
  const allocation = ALLOCATION[businessType];
  if (!allocation) throw new ProvisioningError(`unknown businessType ${businessType}`);
  return allocation;
}

/**
 * A new, unpublished house for `userId` on `plot`. The plot id is also the
 * legacy slot id, so `plotId === slotId`.
 */
export function planProperty({ userId, merchantId = null, allocation, plot }) {
  const id = stableId("prop", userId);
  return Object.freeze({
    id,
    ownerId: userId,
    merchantId,
    slotId: plot.id,
    plotId: plot.id,
    district: plot.district,
    template: plot.template,
    address: `${plot.district}/${plot.id}`,
    agent: allocation.agent
      ? Object.freeze({ id: stableId("agent", userId), ownerId: userId, propertyId: id })
      : null,
    published: false,
  });
}

/**
 * Pure planner over an in-memory plot list (the database path is
 * store/plots.mjs allocateHouse, which locks the plot it takes).
 * @param {object} args
 * @param {string} args.userId the session user, never a client-supplied id
 * @param {string|null} [args.merchantId] the caller's verified merchant the house is bound to
 * @param {'merchant'|'cafe'|'gaming'} args.businessType
 * @param {Array<{id:string, template:string, district:string}>} args.slots plots, in allocation order
 * @param {Array<object>} [args.existing] properties already provisioned
 */
export function provisionProperty({ userId, merchantId = null, businessType, slots, existing = [] }) {
  if (!userId) throw new ProvisioningError("userId is required");
  const allocation = allocationFor(businessType);
  // An ordinary player never receives a property.
  if (!allocation.property) return { property: null, created: false };
  if (!Array.isArray(slots) || slots.length === 0) throw new ProvisioningError("slots are required");

  const already = existing.find((p) => p.ownerId === userId);
  if (already) return { property: already, created: false };

  const taken = new Set(existing.map((p) => p.slotId));
  const slot = slots.find((s) => s.template === allocation.property && !taken.has(s.id))
    ?? slots.find((s) => !taken.has(s.id));
  if (!slot) throw new ProvisioningError("no free property slot for this template");
  return { property: planProperty({ userId, merchantId, allocation, plot: slot }), created: true };
}
