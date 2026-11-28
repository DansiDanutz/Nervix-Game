/** Builder catalogues and their offerings (listings). Methods run with `this` bound to a PostgresStore. */

import { sortByName } from "../listing-display.mjs";

/** The listing columns every read selects (018 adds category, display_slot, sort_order, active). */
export const OFFERING_COLUMNS = "id, name, description, price_minor, currency, app_url, category, display_slot, sort_order, active";

/** Patch field -> column. Only these names ever reach the UPDATE text. */
const PATCH_COLUMNS = Object.freeze({
  name: "name", description: "description", priceMinor: "price_minor", currency: "currency", appUrl: "app_url",
  category: "category", slot: "display_slot", sortOrder: "sort_order", active: "active",
});

/** A listing as houses show it. */
export function listingFromRow(r) {
  return Object.freeze({
    id: r.id, name: r.name, description: r.description, priceMinor: r.price_minor, currency: r.currency,
    category: r.category, slot: r.display_slot, sortOrder: r.sort_order, active: r.active,
  });
}

export const offeringMethods = Object.freeze({
  async createBuilder({ id, ownerId, name, appUrl = null }) {
    await this.pool.query(
      "INSERT INTO builders (id, owner_id, name, app_url) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
      [id, ownerId, name, appUrl]);
  },

  async listBuilders() {
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, name, app_url FROM builders ORDER BY name");
    return rows.map((r) => ({ id: r.id, ownerId: r.owner_id, name: r.name, appUrl: r.app_url }));
  },

  async getBuilder(id) {
    const { rows } = await this.pool.query("SELECT id, owner_id, name, app_url FROM builders WHERE id = $1", [id]);
    return rows[0] ? { id: rows[0].id, ownerId: rows[0].owner_id, name: rows[0].name, appUrl: rows[0].app_url } : null;
  },

  /** A catalogue's active listings (what visitors may see), by the shared name rule (not the DB collation). */
  async listOfferings(builderId) {
    const { rows } = await this.pool.query(
      `SELECT ${OFFERING_COLUMNS} FROM builder_offerings WHERE builder_id = $1 AND active`, [builderId]);
    return sortByName(rows.map((r) => ({ ...listingFromRow(r), appUrl: r.app_url })));
  },

  async addOffering({ id, builderId, name, description = null, priceMinor, currency, appUrl = null,
    category = null, slot = null, sortOrder = 0, active = true }) {
    await this.pool.query(
      `INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency, app_url,
                                      category, display_slot, sort_order, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, builderId, name, description, priceMinor, currency, appUrl, category, slot, sortOrder, active]);
  },

  /** Applies only the patch's fields (so category and slot can be cleared), scoped to the catalogue. */
  async updateOffering({ offeringId, builderId, patch }) {
    const fields = Object.keys(PATCH_COLUMNS).filter((k) => patch[k] !== undefined);
    const sets = fields.map((k, i) => `${PATCH_COLUMNS[k]} = $${i + 3}`);
    const { rows } = await this.pool.query(
      `UPDATE builder_offerings SET ${sets.length ? sets.join(", ") : "name = name"}
        WHERE id = $1 AND builder_id = $2
        RETURNING id, builder_id, name, description, price_minor, currency, app_url, category, display_slot, sort_order, active`,
      [offeringId, builderId, ...fields.map((k) => patch[k])]);
    return rows[0] ?? null;
  },
});
