/** Merchant products (the legacy per-merchant catalogue). Methods run with `this` bound to a PostgresStore. */

export const productMethods = Object.freeze({
  async listProducts(merchantId) {
    const { rows } = await this.pool.query(
      "SELECT sku, name, unit_amount_minor, currency, fulfillment, active FROM products WHERE merchant_id = $1 ORDER BY sku",
      [merchantId],
    );
    return rows.map((r) => ({
      sku: r.sku, name: r.name, unitAmountMinor: r.unit_amount_minor,
      currency: r.currency, fulfillment: r.fulfillment, active: r.active,
    }));
  },

  async upsertProduct(merchantId, product) {
    await this.pool.query(
      `INSERT INTO products (merchant_id, sku, name, unit_amount_minor, currency, fulfillment, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (merchant_id, sku) DO UPDATE
         SET name = excluded.name,
             unit_amount_minor = excluded.unit_amount_minor,
             currency = excluded.currency,
             fulfillment = excluded.fulfillment,
             active = excluded.active`,
      [merchantId, product.sku, product.name, product.unitAmountMinor, product.currency, product.fulfillment, product.active],
    );
  },
});
