/**
 * Properties (houses), their appearance and house profiles. Methods run with
 * `this` bound to a PostgresStore; the exported plain functions are B1 house
 * bindings, kept off the class so its snapshot-tested API is unchanged.
 */

import { OFFERING_COLUMNS, listingFromRow } from "./offerings.mjs";
import { arrangeListings } from "../listing-display.mjs";

export const houseMethods = Object.freeze({
  async saveProperty(property) {
    await this.pool.query(
      `INSERT INTO properties (id, owner_id, slot_id, district, template, address, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [property.id, property.ownerId, property.slotId, property.district, property.template, property.address, property.published],
    );
  },

  async listProperties() {
    const { rows } = await this.pool.query("SELECT id, owner_id, slot_id, district, template, address, published FROM properties ORDER BY slot_id");
    return rows.map((r) => ({
      id: r.id, ownerId: r.owner_id, slotId: r.slot_id, district: r.district,
      template: r.template, address: r.address, published: r.published,
    }));
  },

  async getProperty(propertyId) {
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, merchant_id, plot_id, slot_id, template, palette, address, published FROM properties WHERE id = $1", [propertyId]);
    if (!rows.length) return null;
    // owner_id is kept for existing callers; ownerId/merchantId/plotId are the mapped forms.
    return { ...rows[0], ownerId: rows[0].owner_id, merchantId: rows[0].merchant_id, plotId: rows[0].plot_id };
  },

  async updateAppearance(propertyId, { template, palette }) {
    await this.pool.query("UPDATE properties SET template = $2, palette = $3 WHERE id = $1", [propertyId, template, palette]);
  },

  async getHouseProfile(propertyId) {
    const { rows } = await this.pool.query(
      "SELECT welcome, decor, display, website_url, updated_at FROM house_profiles WHERE property_id = $1", [propertyId]);
    if (!rows.length) return { welcome: null, decor: {}, display: {}, websiteUrl: null, updatedAt: null };
    const r = rows[0];
    return { welcome: r.welcome, decor: r.decor, display: r.display, websiteUrl: r.website_url, updatedAt: r.updated_at };
  },

  /** Merges a validated partial profile into the stored one. */
  async saveHouseProfile(propertyId, patch, userId) {
    const current = await this.getHouseProfile(propertyId);
    const next = {
      welcome: patch.welcome !== undefined ? patch.welcome : current.welcome,
      decor: { ...current.decor, ...(patch.decor ?? {}) },
      display: { ...current.display, ...(patch.display ?? {}) },
      websiteUrl: patch.websiteUrl !== undefined ? patch.websiteUrl : current.websiteUrl,
    };
    await this.pool.query(
      `INSERT INTO house_profiles (property_id, welcome, decor, display, website_url, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (property_id) DO UPDATE
         SET welcome = excluded.welcome, decor = excluded.decor, display = excluded.display,
             website_url = excluded.website_url, updated_by = excluded.updated_by, updated_at = now()`,
      [propertyId, next.welcome, JSON.stringify(next.decor), JSON.stringify(next.display), next.websiteUrl, userId]);
    return this.getHouseProfile(propertyId);
  },

  /**
   * One house and its catalogue: the builder bound to the house's merchant
   * (unique since 017). No owner check is needed here: migration 017's
   * composite key properties_merchant_owner_fkey, (merchant_id, owner_id) ->
   * merchants (id, owner_id), already guarantees the merchant is the owner's,
   * the rule `listWorldHouses` restates in its join. Listings include inactive ones, arranged (P1); routes
   * show visitors only `visibleListings`.
   */
  async getHouse(propertyId) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.owner_id, p.merchant_id, p.published, u.display_name, b.id AS builder_id, b.app_url
         FROM properties p
         JOIN users u ON u.id = p.owner_id
         LEFT JOIN builders b ON b.merchant_id = p.merchant_id
        WHERE p.id = $1`, [propertyId]);
    if (!rows.length) return null;
    const r = rows[0];
    const listings = r.builder_id
      ? (await this.pool.query(`SELECT ${OFFERING_COLUMNS} FROM builder_offerings WHERE builder_id = $1`, [r.builder_id])).rows
      : [];
    return {
      propertyId: r.id,
      ownerId: r.owner_id,
      merchantId: r.merchant_id,
      builderId: r.builder_id,
      ownerName: r.display_name,
      appUrl: r.app_url,
      published: r.published,
      listings: arrangeListings(listings.map(listingFromRow)),
    };
  },

  async listPublishedProperties() {
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, slot_id, district, template, address FROM properties WHERE published = true ORDER BY slot_id");
    return rows.map((r) => ({
      id: r.id, ownerId: r.owner_id, slotId: r.slot_id,
      district: r.district, template: r.template, address: r.address,
    }));
  },
});

/** The house bound to a catalogue's merchant, or null (an unbound catalogue has no house). */
export async function houseOfBuilder(store, builderId) {
  const { rows } = await store.pool.query(
    `SELECT p.id, p.owner_id, p.merchant_id FROM builders b
       JOIN properties p ON p.merchant_id = b.merchant_id
      WHERE b.id = $1`, [builderId]);
  return rows[0] ? Object.freeze({ id: rows[0].id, ownerId: rows[0].owner_id, merchantId: rows[0].merchant_id }) : null;
}

/**
 * Catalogues a viewer may browse: those bound to a published house, plus the
 * viewer's own. An unpublished or unbound catalogue is hidden from everyone else.
 */
export async function listVisibleBuilders(store, viewerId) {
  const { rows } = await store.pool.query(
    `SELECT b.id, b.owner_id, b.name, b.app_url FROM builders b
       LEFT JOIN properties p ON p.merchant_id = b.merchant_id
      WHERE (b.merchant_id IS NOT NULL AND p.published) OR b.owner_id = $1
      ORDER BY b.name`, [viewerId]);
  return Object.freeze(rows.map((r) => Object.freeze({ id: r.id, ownerId: r.owner_id, name: r.name, appUrl: r.app_url })));
}

/** The caller's own house (one per owner, D4), or null. */
export async function houseOfOwner(store, ownerId) {
  const { rows } = await store.pool.query("SELECT id, owner_id, merchant_id FROM properties WHERE owner_id = $1", [ownerId]);
  return rows[0] ? Object.freeze({ id: rows[0].id, ownerId: rows[0].owner_id, merchantId: rows[0].merchant_id }) : null;
}

/**
 * Binds an unbound catalogue to its owner's merchant, unless that merchant
 * already has one (one catalogue per merchant). Returns whether it bound.
 */
export async function bindBuilderMerchant(store, builderId, merchantId) {
  try {
    const { rowCount } = await store.pool.query(
      `UPDATE builders b SET merchant_id = $2
        WHERE b.id = $1 AND b.merchant_id IS NULL
          AND EXISTS (SELECT 1 FROM merchants m WHERE m.id = $2 AND m.owner_id = b.owner_id)
          AND NOT EXISTS (SELECT 1 FROM builders o WHERE o.merchant_id = $2)`, [builderId, merchantId]);
    return rowCount > 0;
  } catch (error) {
    if (error.code === "23505") return false; // a concurrent bind won
    throw error;
  }
}

/** Upper bound on one directory read: well above the district's plot count, so the public query stays bounded. */
export const WORLD_HOUSES_LIMIT = 200;

/**
 * B3 world directory: published houses on a plot, bound to a verified,
 * non-suspended merchant with the house's owner, in plot order (at most
 * WORLD_HOUSES_LIMIT). Public fields only; owner and merchant ids never leave the server.
 */
export async function listWorldHouses(store) {
  const { rows } = await store.pool.query(
    `SELECT p.id, p.plot_id, p.template, p.palette, m.name
       FROM properties p
       JOIN plots pl ON pl.id = p.plot_id
       JOIN merchants m ON m.id = p.merchant_id AND m.owner_id = p.owner_id
      WHERE p.published AND m.verified_at IS NOT NULL AND NOT m.suspended
      ORDER BY pl.sort_order, pl.id, p.id
      LIMIT $1`, [WORLD_HOUSES_LIMIT]);
  return Object.freeze(rows.map((r) => Object.freeze({
    plotId: r.plot_id, propertyId: r.id, merchantName: r.name, verified: true, theme: r.template, accent: r.palette,
  })));
}
