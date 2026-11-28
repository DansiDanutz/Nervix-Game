/**
 * Shared server state for the route modules: the in-memory demo db, the slot
 * table and the link registry. Built once per process by src/index.mjs.
 */

import { linkRegistry } from "../link-registry.mjs";
import { createPayments } from "../payments-config.mjs";
import { createEmailer } from "../email.mjs";
import { TOOLS } from "../agent.mjs";
import { createProvider, createSpeechProvider } from "../provider.mjs";
import { PostgresStore } from "../store.mjs";

const MERCHANT_HOUSES = 8;
const CAFES = 4;
const VENUES = 2;

export const SLOTS = Object.freeze([
  ...Array.from({ length: MERCHANT_HOUSES }, (_, i) => ({
    id: `slot-${String(i + 1).padStart(2, "0")}`,
    template: "merchant_house",
    district: "merchant-quarter",
  })),
  ...Array.from({ length: CAFES }, (_, i) => ({
    id: `cafe-${i + 1}`,
    template: "cafe_shop",
    district: "coffee-courtyard",
  })),
  ...Array.from({ length: VENUES }, (_, i) => ({
    id: `venue-${i + 1}`,
    template: "casino_venue",
    district: "entertainment-district",
  })),
]);

function createDb(env) {
  return {
    orders: new Map(),
    properties: [],
    campaigns: [],
    conversations: new Map(),
    provider: createProvider(env),
    speech: createSpeechProvider(env),
    email: createEmailer(env),
    store: env.DATABASE_URL ? new PostgresStore(env.DATABASE_URL) : null,
    payments: createPayments(env),
    catalog: [
      { sku: "coffee", name: "Coffee", unitAmountMinor: 450, currency: "EUR", fulfillment: "pickup", active: true, merchantId: "mer_1" },
      { sku: "pastry", name: "Pastry", unitAmountMinor: 300, currency: "EUR", fulfillment: "pickup", active: true, merchantId: "mer_1" },
    ],
    agent: {
      config: { name: "Mira", tone: "warm", languages: ["en", "ro"], allowed_actions: [TOOLS.SEARCH_CATALOG, TOOLS.READ_PRODUCT, TOOLS.CREATE_CHECKOUT, TOOLS.REQUEST_SUPPORT] },
      knowledge: [
        { id: "k1", kind: "faq", content: "We open at 08:00 and close at 20:00.", approved: true },
        { id: "k2", kind: "doc", content: "Internal cost data.", approved: false },
      ],
    },
  };
}

/** The route context. `db` is mutable server state by design (demo, in-memory). */
export function createContext({ env = process.env } = {}) {
  return Object.freeze({
    db: createDb(env),
    slots: SLOTS,
    registry: linkRegistry(env.WORLD_REGISTRY_URL),
  });
}
