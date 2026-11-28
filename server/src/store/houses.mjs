/** Properties (houses), their appearance and house profiles. Methods run with `this` bound to a PostgresStore. */

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
    const { rows } = await this.pool.query("SELECT id, owner_id, merchant_id, slot_id, template, palette, address FROM properties WHERE id = $1", [propertyId]);
    if (!rows.length) return null;
    // owner_id is kept for existing callers; ownerId/merchantId are the mapped forms.
    return { ...rows[0], ownerId: rows[0].owner_id, merchantId: rows[0].merchant_id };
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

  async getHouse(propertyId) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.owner_id, p.merchant_id, u.display_name, b.id AS builder_id, b.app_url
         FROM properties p
         JOIN users u ON u.id = p.owner_id
         LEFT JOIN builders b ON b.owner_id = p.owner_id
        WHERE p.id = $1`, [propertyId]);
    if (!rows.length) return null;
    const r = rows[0];
    const listings = r.builder_id
      ? (await this.pool.query(
          "SELECT id, name, price_minor, currency FROM builder_offerings WHERE builder_id = $1 ORDER BY name", [r.builder_id])).rows
      : [];
    return {
      propertyId: r.id,
      ownerId: r.owner_id,
      merchantId: r.merchant_id,
      builderId: r.builder_id,
      ownerName: r.display_name,
      appUrl: r.app_url,
      listings: listings.map((l) => ({ id: l.id, name: l.name, priceMinor: l.price_minor, currency: l.currency })),
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
