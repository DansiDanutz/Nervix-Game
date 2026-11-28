/** Merchant records, verification, suspension and knowledge sources. Methods run with `this` bound to a PostgresStore. */

export function mapMerchant(r) {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, businessType: r.business_type,
    suspended: r.suspended, verified: r.verified_at !== null, verifiedAt: r.verified_at,
  };
}

export const merchantMethods = Object.freeze({
  async ensureMerchant(id, ownerId, name = "Demo Merchant") {
    await this.pool.query(
      `INSERT INTO merchants (id, owner_id, business_type, name) VALUES ($1, $2, 'merchant', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, name],
    );
  },

  async getMerchant(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, name, business_type, suspended, verified_at FROM merchants WHERE id = $1", [id]);
    return rows[0] ? mapMerchant(rows[0]) : null;
  },

  async listMerchantsByOwner(ownerId) {
    if (!ownerId) return [];
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, name, business_type, suspended, verified_at FROM merchants WHERE owner_id = $1 ORDER BY id", [ownerId]);
    return rows.map(mapMerchant);
  },

  async setMerchantVerified(merchantId, verified) {
    const { rowCount } = await this.pool.query(
      "UPDATE merchants SET verified_at = CASE WHEN $2 THEN COALESCE(verified_at, now()) ELSE NULL END WHERE id = $1",
      [merchantId, verified]);
    return rowCount > 0;
  },

  async listMerchants() {
    const { rows } = await this.pool.query(
      "SELECT id, name, business_type, suspended FROM merchants ORDER BY name",
    );
    return rows.map((r) => ({ id: r.id, name: r.name, businessType: r.business_type, suspended: r.suspended }));
  },

  async setSuspended(merchantId, suspended) {
    await this.pool.query("UPDATE merchants SET suspended = $2 WHERE id = $1", [merchantId, suspended]);
  },

  async addKnowledge(merchantId, { kind, content, uri = null }) {
    const { rows } = await this.pool.query(
      `INSERT INTO knowledge_sources (merchant_id, kind, uri, content, approved)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [merchantId, kind, uri, content],
    );
    return rows[0].id;
  },

  async listKnowledge(merchantId, approvedOnly = false) {
    const { rows } = await this.pool.query(
      `SELECT id, kind, uri, content, approved FROM knowledge_sources
       WHERE merchant_id = $1 AND ($2 = false OR approved = true) ORDER BY id`,
      [merchantId, approvedOnly],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, uri: r.uri, content: r.content, approved: r.approved }));
  },

  async approveKnowledge(id) {
    await this.pool.query("UPDATE knowledge_sources SET approved = true WHERE id = $1", [id]);
  },
});

/**
 * Persists a provisioned house together with its merchant binding and plot.
 * An existing row keeps its merchant; one with none is bound, but only for the
 * same owner (migration 017 also rejects a merchant of another owner). `q` is
 * anything with `query` (a pool or a transaction client). Returns the stored
 * merchant id, which the caller must compare with the authorised merchant.
 * A plain function, not a PostgresStore method, so the store's public API
 * (snapshot-tested since F0) is unchanged.
 */
export async function saveMerchantProperty(q, property) {
  await q.query(
    `INSERT INTO properties (id, owner_id, merchant_id, plot_id, slot_id, district, template, address, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET merchant_id = COALESCE(properties.merchant_id, excluded.merchant_id)
       WHERE properties.owner_id = excluded.owner_id`,
    [property.id, property.ownerId, property.merchantId, property.plotId ?? null, property.slotId, property.district,
      property.template, property.address, property.published],
  );
  const { rows } = await q.query("SELECT merchant_id FROM properties WHERE id = $1", [property.id]);
  return rows[0]?.merchant_id ?? null;
}
