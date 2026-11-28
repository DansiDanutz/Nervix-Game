/**
 * Idempotent merchant property provisioning.
 *
 * A merchant gets exactly one property and one AI employee. Retries, refreshes
 * and repeated logins must never create a second property. Slots are stable and
 * assigned from the Blender-authored district; no Blender run is needed at
 * signup.
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

/**
 * @param {object} args
 * @param {string} args.userId the session user, never a client-supplied id
 * @param {string|null} [args.merchantId] the caller's verified merchant the house is bound to
 * @param {'merchant'|'cafe'|'gaming'} args.businessType
 * @param {Array<{id:string, template:string, district:string}>} args.slots
 * @param {Array<object>} [args.existing] properties already provisioned
 */
export function provisionProperty({ userId, merchantId = null, businessType, slots, existing = [] }) {
  if (!userId) throw new ProvisioningError("userId is required");
  const allocation = ALLOCATION[businessType];
  if (!allocation) throw new ProvisioningError(`unknown businessType ${businessType}`);
  // An ordinary player never receives a property.
  if (!allocation.property) return { property: null, created: false };
  if (!Array.isArray(slots) || slots.length === 0) throw new ProvisioningError("slots are required");

  const already = existing.find((p) => p.ownerId === userId);
  if (already) return { property: already, created: false };

  const taken = new Set(existing.map((p) => p.slotId));
  const slot = slots.find((s) => s.template === allocation.property && !taken.has(s.id))
    ?? slots.find((s) => !taken.has(s.id));
  if (!slot) throw new ProvisioningError("no free property slot for this template");

  const property = Object.freeze({
    id: stableId("prop", userId),
    ownerId: userId,
    merchantId,
    slotId: slot.id,
    district: slot.district,
    template: slot.template,
    address: `${slot.district}/${slot.id}`,
    agent: allocation.agent
      ? Object.freeze({ id: stableId("agent", userId), ownerId: userId, propertyId: stableId("prop", userId) })
      : null,
    published: false,
  });

  return { property, created: true };
}