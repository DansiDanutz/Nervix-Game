/** Builder catalogues and their offerings (listings). Methods run with `this` bound to a PostgresStore. */

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

  async listOfferings(builderId) {
    const { rows } = await this.pool.query(
      "SELECT id, name, description, price_minor, currency, app_url FROM builder_offerings WHERE builder_id = $1 ORDER BY name", [builderId]);
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, priceMinor: r.price_minor, currency: r.currency, appUrl: r.app_url }));
  },

  async addOffering({ id, builderId, name, description = null, priceMinor, currency, appUrl = null }) {
    await this.pool.query(
      `INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency, app_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, builderId, name, description, priceMinor, currency, appUrl]);
  },

  async updateOffering({ offeringId, builderId, patch }) {
    const { rows } = await this.pool.query(
      `UPDATE builder_offerings
         SET name = COALESCE($3, name),
             description = COALESCE($4, description),
             price_minor = COALESCE($5, price_minor),
             currency = COALESCE($6, currency),
             app_url = COALESCE($7, app_url)
       WHERE id = $1 AND builder_id = $2
       RETURNING id, builder_id, name, description, price_minor, currency, app_url`,
      [offeringId, builderId, patch.name ?? null, patch.description ?? null,
       patch.priceMinor ?? null, patch.currency ?? null, patch.appUrl ?? null]);
    return rows[0] ?? null;
  },
});
