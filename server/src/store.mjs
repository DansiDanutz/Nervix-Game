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

  async listPlacements() {
    const { rows } = await this.pool.query(
      "SELECT id, district, kind, slot_id, price_minor, currency FROM ad_placements ORDER BY id",
    );
    return rows.map((r) => ({
      id: r.id, district: r.district, kind: r.kind,
      slotId: r.slot_id, priceMinor: r.price_minor, currency: r.currency,
    }));
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
    const { rows } = await this.pool.query("SELECT id, display_name, email_verified, role FROM users WHERE email = $1", [email]);
    return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name, verified: rows[0].email_verified, role: rows[0].role } : null;
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

  async listProducts(merchantId) {
    const { rows } = await this.pool.query(
      "SELECT sku, name, unit_amount_minor, currency, fulfillment, active FROM products WHERE merchant_id = $1 ORDER BY sku",
      [merchantId],
    );
    return rows.map((r) => ({
      sku: r.sku, name: r.name, unitAmountMinor: r.unit_amount_minor,
      currency: r.currency, fulfillment: r.fulfillment, active: r.active,
    }));
  }

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
  }

  async updateAgent(propertyId, config) {
    await this.pool.query(
      `INSERT INTO agent_configs (property_id, name, tone, languages, allowed_actions, monthly_request_cap)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (property_id) DO UPDATE
         SET name = excluded.name,
             tone = excluded.tone,
             languages = excluded.languages,
             allowed_actions = excluded.allowed_actions,
             monthly_request_cap = excluded.monthly_request_cap`,
      [propertyId, config.name, config.tone, config.languages, config.allowed_actions, config.monthlyRequestCap ?? null],
    );
  }

  async updateAppearance(propertyId, { template, palette }) {
    await this.pool.query("UPDATE properties SET template = $2, palette = $3 WHERE id = $1", [propertyId, template, palette]);
  }

  async getProperty(propertyId) {
    const { rows } = await this.pool.query("SELECT id, owner_id, slot_id, template, palette, address FROM properties WHERE id = $1", [propertyId]);
    return rows[0] ?? null;
  }

  async listOrders(buyerId, limit = 20) {
    const { rows } = await this.pool.query(
      `SELECT id, state, total_minor, currency, fulfillment, created_at
       FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [buyerId, limit],
    );
    return rows.map((r) => ({
      id: r.id, state: r.state, totalMinor: r.total_minor,
      currency: r.currency, fulfillment: r.fulfillment, createdAt: r.created_at,
    }));
  }

  async addKnowledge(merchantId, { kind, content, uri = null }) {
    const { rows } = await this.pool.query(
      `INSERT INTO knowledge_sources (merchant_id, kind, uri, content, approved)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [merchantId, kind, uri, content],
    );
    return rows[0].id;
  }

  async listKnowledge(merchantId, approvedOnly = false) {
    const { rows } = await this.pool.query(
      `SELECT id, kind, uri, content, approved FROM knowledge_sources
       WHERE merchant_id = $1 AND ($2 = false OR approved = true) ORDER BY id`,
      [merchantId, approvedOnly],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, uri: r.uri, content: r.content, approved: r.approved }));
  }

  async approveKnowledge(id) {
    await this.pool.query("UPDATE knowledge_sources SET approved = true WHERE id = $1", [id]);
  }

  async getAgent(propertyId) {
    const { rows } = await this.pool.query(
      "SELECT name, tone, languages, allowed_actions, monthly_request_cap FROM agent_configs WHERE property_id = $1",
      [propertyId],
    );
    return rows[0] ?? null;
  }

  async addUsage(propertyId, month, { requests, tokens }) {
    await this.pool.query(
      `INSERT INTO agent_usage (property_id, month, requests, tokens) VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, month) DO UPDATE
         SET requests = agent_usage.requests + excluded.requests,
             tokens = agent_usage.tokens + excluded.tokens`,
      [propertyId, month, requests, tokens],
    );
  }

  async getUsage(propertyId, month) {
    const { rows } = await this.pool.query(
      "SELECT requests, tokens FROM agent_usage WHERE property_id = $1 AND month = $2",
      [propertyId, month],
    );
    return rows[0] ?? { requests: 0, tokens: 0 };
  }

  async listApps() {
    const { rows } = await this.pool.query("SELECT id, name, category, integration, auth_required FROM apps ORDER BY id");
    return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, integration: r.integration, authRequired: r.auth_required }));
  }

  async listMerchantApps(merchantId) {
    const { rows } = await this.pool.query(
      `SELECT a.id, a.name, a.category, c.config, c.health
       FROM apps a
       LEFT JOIN merchant_app_connections c ON c.app_id = a.id AND c.merchant_id = $1
       ORDER BY a.id`,
      [merchantId],
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, category: r.category,
      connected: r.health !== null, health: r.health ?? "not_connected",
      config: r.config ?? {},
    }));
  }

  async connectApp(merchantId, appId, config) {
    await this.pool.query(
      `INSERT INTO merchant_app_connections (merchant_id, app_id, config, credentials, health)
       VALUES ($1, $2, $3, '{}'::jsonb, 'demo')
       ON CONFLICT (merchant_id, app_id) DO UPDATE
         SET config = excluded.config, health = 'demo'`,
      [merchantId, appId, JSON.stringify(config)],
    );
  }

  async disconnectApp(merchantId, appId) {
    await this.pool.query("DELETE FROM merchant_app_connections WHERE merchant_id = $1 AND app_id = $2", [merchantId, appId]);
  }

  async isAdmin(userId) {
    const { rows } = await this.pool.query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role === "admin";
  }

  async createSession(userId, expiresAt) {
    const id = `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await this.pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)", [id, userId, expiresAt]);
    return id;
  }

  async getSession(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      "SELECT s.user_id, u.display_name, u.email_verified, u.profile_completed, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()", [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.user_id, displayName: r.display_name, emailVerified: r.email_verified, profileCompleted: r.profile_completed };
  }

  async deleteSession(id) {
    await this.pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }

  async completeProfile(userId, displayName) {
    await this.pool.query("UPDATE users SET profile_completed = true, display_name = COALESCE($2, display_name) WHERE id = $1", [userId, displayName ?? null]);
  }

  async findUser(userId) {
    if (!userId) return null;
    const { rows } = await this.pool.query(
      "SELECT id, display_name, email_verified, role FROM users WHERE id = $1", [userId]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, displayName: r.display_name, emailVerified: r.email_verified, role: r.role };
  }

  async createBuilder({ id, ownerId, name, appUrl = null }) {
    await this.pool.query(
      "INSERT INTO builders (id, owner_id, name, app_url) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
      [id, ownerId, name, appUrl]);
  }

  async listBuilders() {
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, name, app_url FROM builders ORDER BY name");
    return rows.map((r) => ({ id: r.id, ownerId: r.owner_id, name: r.name, appUrl: r.app_url }));
  }

  async getBuilder(id) {
    const { rows } = await this.pool.query("SELECT id, owner_id, name, app_url FROM builders WHERE id = $1", [id]);
    return rows[0] ? { id: rows[0].id, ownerId: rows[0].owner_id, name: rows[0].name, appUrl: rows[0].app_url } : null;
  }

  async listOfferings(builderId) {
    const { rows } = await this.pool.query(
      "SELECT id, name, description, price_minor, currency, app_url FROM builder_offerings WHERE builder_id = $1 ORDER BY name", [builderId]);
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, priceMinor: r.price_minor, currency: r.currency, appUrl: r.app_url }));
  }

  async addOffering({ id, builderId, name, description = null, priceMinor, currency, appUrl = null }) {
    await this.pool.query(
      `INSERT INTO builder_offerings (id, builder_id, name, description, price_minor, currency, app_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, builderId, name, description, priceMinor, currency, appUrl]);
  }

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
  }

  async getHouse(propertyId) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.owner_id, u.display_name, b.id AS builder_id, b.app_url
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
      ownerName: r.display_name,
      appUrl: r.app_url,
      listings: listings.map((l) => ({ id: l.id, name: l.name, priceMinor: l.price_minor, currency: l.currency })),
    };
  }

  async listPublishedProperties() {
    const { rows } = await this.pool.query(
      "SELECT id, owner_id, slot_id, district, template, address FROM properties WHERE published = true ORDER BY slot_id");
    return rows.map((r) => ({
      id: r.id, ownerId: r.owner_id, slotId: r.slot_id,
      district: r.district, template: r.template, address: r.address,
    }));
  }

  async listMerchants() {
    const { rows } = await this.pool.query(
      "SELECT id, name, business_type, suspended FROM merchants ORDER BY name",
    );
    return rows.map((r) => ({ id: r.id, name: r.name, businessType: r.business_type, suspended: r.suspended }));
  }

  async setSuspended(merchantId, suspended) {
    await this.pool.query("UPDATE merchants SET suspended = $2 WHERE id = $1", [merchantId, suspended]);
  }

  async addAudit({ actorId, action, subject, detail = null }) {
    await this.pool.query(
      `INSERT INTO audit_events (actor_id, action, subject, detail) VALUES ($1, $2, $3, $4)`,
      [actorId, action, subject, detail ? JSON.stringify(detail) : null],
    );
  }

  async listAudit(limit = 50) {
    const { rows } = await this.pool.query(
      "SELECT id, actor_id, action, subject, detail, created_at FROM audit_events ORDER BY id DESC LIMIT $1",
      [limit],
    );
    return rows.map((r) => ({
      id: r.id, actorId: r.actor_id, action: r.action,
      subject: r.subject, detail: r.detail, createdAt: r.created_at,
    }));
  }

  async close() {
    await this.pool.end();
  }
}