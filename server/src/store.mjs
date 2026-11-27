/**
 * Postgres persistence.
 *
 * The in-memory store is the default for tests; set DATABASE_URL to persist.
 * Orders are written transactionally (order + items together) and ids are the
 * application's stable text ids, so a retry updates rather than duplicates.
 */

import pg from "pg";

const { Pool } = pg;

export class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async ensureUser(id, displayName = "Traveler") {
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, role) VALUES ($1, $2, $3, 'player')
       ON CONFLICT (id) DO NOTHING`,
      [id, `${id}@demo.nervix.invalid`, displayName],
    );
  }

  async ensureMerchant(id, ownerId, name = "Demo Merchant") {
    await this.pool.query(
      `INSERT INTO merchants (id, owner_id, business_type, name) VALUES ($1, $2, 'merchant', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, ownerId, name],
    );
  }

  async saveOrder(order) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO orders (id, buyer_id, merchant_id, currency, total_minor, fulfillment, state, terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET state = excluded.state,
               total_minor = excluded.total_minor,
               updated_at = now()`,
        [order.id, order.buyerId, order.merchantId, order.currency, order.totalMinor, order.fulfillment, order.state, order.terms ?? null],
      );
      await client.query("DELETE FROM order_items WHERE order_id = $1", [order.id]);
      for (const item of order.items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, unit_amount_minor, quantity, line_total_minor)
           VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
          [order.id, item.sku, item.name, item.unitAmountMinor, item.quantity, item.lineTotalMinor],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrder(id) {
    const { rows } = await this.pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const items = (await this.pool.query("SELECT sku, name, unit_amount_minor, quantity, line_total_minor FROM order_items WHERE order_id = $1", [id])).rows;
    return {
      id: row.id,
      buyerId: row.buyer_id,
      merchantId: row.merchant_id,
      currency: row.currency,
      totalMinor: row.total_minor,
      fulfillment: row.fulfillment,
      state: row.state,
      terms: row.terms,
      items: items.map((i) => ({
        sku: i.sku, name: i.name, unitAmountMinor: i.unit_amount_minor,
        quantity: i.quantity, lineTotalMinor: i.line_total_minor,
      })),
      events: [],
    };
  }

  async saveProperty(property) {
    await this.pool.query(
      `INSERT INTO properties (id, owner_id, slot_id, district, template, address, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [property.id, property.ownerId, property.slotId, property.district, property.template, property.address, property.published],
    );
  }

  async listProperties() {
    const { rows } = await this.pool.query("SELECT id, owner_id, slot_id, district, template, address, published FROM properties ORDER BY slot_id");
    return rows.map((r) => ({
      id: r.id, ownerId: r.owner_id, slotId: r.slot_id, district: r.district,
      template: r.template, address: r.address, published: r.published,
    }));
  }

  async close() {
    await this.pool.end();
  }
}