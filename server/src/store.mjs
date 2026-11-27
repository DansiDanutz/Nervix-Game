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

  async saveCampaign(campaign) {
    await this.pool.query(
      `INSERT INTO campaigns (id, merchant_id, placement_id, creative, state, starts_at, ends_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET state = excluded.state,
             paid_at = excluded.paid_at,
             creative = excluded.creative`,
      [
        campaign.id, campaign.merchantId, campaign.placementId,
        JSON.stringify({ priceMinor: campaign.priceMinor, currency: campaign.currency }),
        campaign.state, campaign.startsAt, campaign.endsAt, campaign.paidAt,
      ],
    );
  }

  async listCampaigns() {
    const { rows } = await this.pool.query(
      "SELECT id, merchant_id, placement_id, creative, state, starts_at, ends_at, paid_at FROM campaigns ORDER BY id",
    );
    return rows.map((r) => ({
      id: r.id,
      merchantId: r.merchant_id,
      placementId: r.placement_id,
      priceMinor: r.creative?.priceMinor ?? 0,
      currency: r.creative?.currency ?? "EUR",
      state: r.state,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    }));
  }

  async saveConversation(propertyId, state) {
    await this.pool.query(
      `INSERT INTO conversations (property_id, history, support, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (property_id) DO UPDATE
         SET history = excluded.history,
             support = excluded.support,
             updated_at = now()`,
      [propertyId, JSON.stringify(state.history ?? []), JSON.stringify(state.support ?? [])],
    );
  }

  async getConversation(propertyId) {
    const { rows } = await this.pool.query("SELECT history, support FROM conversations WHERE property_id = $1", [propertyId]);
    if (rows.length === 0) return null;
    return { history: rows[0].history ?? [], support: rows[0].support ?? [] };
  }

  async createUser({ id, email, displayName, verified = false }) {
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, role, email_verified)
       VALUES ($1, $2, $3, 'player', $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, email, displayName, verified],
    );
  }

  async findUserByEmail(email) {
    const { rows } = await this.pool.query("SELECT id, display_name, email_verified FROM users WHERE email = $1", [email]);
    return rows[0] ?? null;
  }

  async markVerified(userId) {
    await this.pool.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
  }

  async createCode({ email, codeHash, expiresAt }) {
    const { rows } = await this.pool.query(
      `INSERT INTO verification_codes (email, code_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
      [email, codeHash, expiresAt],
    );
    return rows[0].id;
  }

  async latestCode(email) {
    const { rows } = await this.pool.query(
      `SELECT id, code_hash, expires_at, consumed_at FROM verification_codes
       WHERE email = $1 ORDER BY id DESC LIMIT 1`,
      [email],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, codeHash: r.code_hash, expiresAt: r.expires_at, consumedAt: r.consumed_at };
  }

  async consumeCode(id) {
    await this.pool.query("UPDATE verification_codes SET consumed_at = now() WHERE id = $1", [id]);
  }

  async getProgress(userId, questId) {
    const { rows } = await this.pool.query(
      "SELECT step_index, completed, seals FROM progress WHERE user_id = $1 AND quest_id = $2",
      [userId, questId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { questId, stepIndex: r.step_index, seals: r.seals ?? [], completed: r.completed };
  }

  async saveProgress({ userId, questId, stepIndex, seals, completed }) {
    await this.pool.query(
      `INSERT INTO progress (user_id, quest_id, step_index, completed, seals)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, quest_id) DO UPDATE
         SET step_index = excluded.step_index,
             completed = excluded.completed,
             seals = excluded.seals`,
      [userId, questId, stepIndex, completed, JSON.stringify(seals)],
    );
  }

  async close() {
    await this.pool.end();
  }
}