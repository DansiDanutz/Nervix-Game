/** App directory and per-merchant app connections. Methods run with `this` bound to a PostgresStore. */

export const appMethods = Object.freeze({
  async listApps() {
    const { rows } = await this.pool.query("SELECT id, name, category, integration, auth_required FROM apps ORDER BY id");
    return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, integration: r.integration, authRequired: r.auth_required }));
  },

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
  },

  async connectApp(merchantId, appId, config) {
    await this.pool.query(
      `INSERT INTO merchant_app_connections (merchant_id, app_id, config, credentials, health)
       VALUES ($1, $2, $3, '{}'::jsonb, 'demo')
       ON CONFLICT (merchant_id, app_id) DO UPDATE
         SET config = excluded.config, health = 'demo'`,
      [merchantId, appId, JSON.stringify(config)],
    );
  },

  async disconnectApp(merchantId, appId) {
    await this.pool.query("DELETE FROM merchant_app_connections WHERE merchant_id = $1 AND app_id = $2", [merchantId, appId]);
  },
});
