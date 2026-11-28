/** Merchant agent configuration and monthly usage. Methods run with `this` bound to a PostgresStore. */

export const agentMethods = Object.freeze({
  async getAgent(propertyId) {
    const { rows } = await this.pool.query(
      "SELECT name, tone, languages, allowed_actions, monthly_request_cap FROM agent_configs WHERE property_id = $1",
      [propertyId],
    );
    return rows[0] ?? null;
  },

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
  },

  async addUsage(propertyId, month, { requests, tokens }) {
    await this.pool.query(
      `INSERT INTO agent_usage (property_id, month, requests, tokens) VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, month) DO UPDATE
         SET requests = agent_usage.requests + excluded.requests,
             tokens = agent_usage.tokens + excluded.tokens`,
      [propertyId, month, requests, tokens],
    );
  },

  async getUsage(propertyId, month) {
    const { rows } = await this.pool.query(
      "SELECT requests, tokens FROM agent_usage WHERE property_id = $1 AND month = $2",
      [propertyId, month],
    );
    return rows[0] ?? { requests: 0, tokens: 0 };
  },
});
