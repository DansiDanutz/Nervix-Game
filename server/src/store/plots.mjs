/**
 * Plot registry (migration 017) and transactional house allocation.
 *
 * Allocation runs in one transaction: a per-user advisory lock serialises one
 * caller's retries, and the free plot is taken with FOR UPDATE SKIP LOCKED, so
 * concurrent callers never pick the same plot. A plot whose house committed
 * after the SELECT's snapshot is caught by a re-check in a fresh statement
 * once locked, and skipped. A plot/slot unique violation that still slips
 * through is retried with jitter; any other unique conflict (the merchant is
 * already bound to another house) is a cross_owner denial.
 * Plain functions taking a PostgresStore, so the store's public API (a
 * snapshot since F0) is unchanged.
 */

import { allocationFor, planProperty, ProvisioningError } from "../provision.mjs";
import { AccessError } from "../entitlement.mjs";
import { saveMerchantProperty } from "./merchants.mjs";

const UNIQUE_VIOLATION = "23505";
/** Only these conflicts mean "someone took that plot first"; they are worth a retry. */
const PLOT_CONFLICTS = Object.freeze(["properties_plot_id_key", "properties_slot_id_key"]);
const MAX_ATTEMPTS = 8;
const JITTER_MS = 15;
const LOCK_PREFIX = "nervix:provision:";

const mapPlot = (r) => Object.freeze({ id: r.id, district: r.district, template: r.template });

const mapProperty = (r) => Object.freeze({
  id: r.id, ownerId: r.owner_id, slotId: r.slot_id, district: r.district,
  template: r.template, address: r.address, published: r.published, merchantId: r.merchant_id,
});

/** Every plot, in allocation order. */
export async function listPlots(store) {
  const { rows } = await store.pool.query("SELECT id, district, template FROM plots ORDER BY sort_order, id");
  return Object.freeze(rows.map(mapPlot));
}

async function inTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ownedProperty(q, userId) {
  const { rows } = await q.query(
    `SELECT id, owner_id, slot_id, district, template, address, published, merchant_id
       FROM properties WHERE owner_id = $1 FOR UPDATE`, [userId]);
  return rows[0] ? mapProperty(rows[0]) : null;
}

/** The first free plot, preferring the wanted template; locked rows are skipped, never waited on. */
async function lockCandidatePlot(q, template) {
  const { rows } = await q.query(
    `SELECT pl.id, pl.district, pl.template FROM plots pl
      WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.plot_id = pl.id OR p.slot_id = pl.id)
      ORDER BY (pl.template = $1) DESC, pl.sort_order, pl.id
      LIMIT 1
      FOR UPDATE OF pl SKIP LOCKED`, [template]);
  return rows[0] ? mapPlot(rows[0]) : null;
}

/** Re-checked in a new statement (fresh READ COMMITTED snapshot), after the plot row is locked. */
async function plotTaken(q, plotId) {
  const { rows } = await q.query(
    "SELECT EXISTS (SELECT 1 FROM properties WHERE plot_id = $1 OR slot_id = $1) AS taken", [plotId]);
  return rows[0].taken;
}

/**
 * Locks a plot that is free as of now. A candidate housed after the locking
 * SELECT's snapshot stays locked by us (harmless) and drops out of the next
 * SELECT, whose fresh snapshot sees that house; so this ends within the plot count.
 */
async function lockFreePlot(q, template) {
  for (;;) {
    const plot = await lockCandidatePlot(q, template);
    if (!plot || !(await plotTaken(q, plot.id))) return plot;
  }
}

async function allocateOnce(q, { userId, merchantId }, allocation) {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${LOCK_PREFIX}${userId}`]);
  const existing = await ownedProperty(q, userId);
  if (existing) {
    const stored = await saveMerchantProperty(q, { ...existing, merchantId });
    return { property: Object.freeze({ ...existing, merchantId: stored }), created: false };
  }
  const plot = await lockFreePlot(q, allocation.property);
  if (!plot) throw new ProvisioningError("no free plot");
  const planned = planProperty({ userId, merchantId, allocation, plot });
  const stored = await saveMerchantProperty(q, planned);
  return { property: Object.freeze({ ...planned, merchantId: stored }), created: true };
}

/**
 * Returns the caller's house, creating it on a free plot if they have none.
 * @param {import("../store.mjs").PostgresStore} store
 * @param {{userId: string, merchantId?: string|null, businessType: string}} request
 */
export async function allocateHouse(store, { userId, merchantId = null, businessType }) {
  if (!userId) throw new ProvisioningError("userId is required");
  const allocation = allocationFor(businessType);
  if (!allocation.property) return { property: null, created: false };
  for (let attempt = 1; ; attempt++) {
    try {
      return await inTransaction(store.pool, (q) => allocateOnce(q, { userId, merchantId }, allocation));
    } catch (error) {
      if (error.code !== UNIQUE_VIOLATION) throw error;
      if (!PLOT_CONFLICTS.includes(error.constraint)) {
        throw new AccessError("this merchant is already bound to another house", "cross_owner");
      }
      if (attempt >= MAX_ATTEMPTS) throw error;
      await pause(Math.random() * JITTER_MS * attempt);
    }
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
