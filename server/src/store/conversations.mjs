/**
 * Merchant agent conversation history, private per (property, user).
 * Methods run with `this` bound to a PostgresStore. The legacy per-property
 * `conversations` table (migration 005) is kept but no longer read or written.
 */

export const conversationMethods = Object.freeze({
  async saveConversation(propertyId, userId, state) {
    await this.pool.query(
      `INSERT INTO user_conversations (property_id, user_id, history, support, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (property_id, user_id) DO UPDATE
         SET history = excluded.history,
             support = excluded.support,
             updated_at = now()`,
      [propertyId, userId, JSON.stringify(state.history ?? []), JSON.stringify(state.support ?? [])],
    );
  },

  async getConversation(propertyId, userId) {
    const { rows } = await this.pool.query(
      "SELECT history, support FROM user_conversations WHERE property_id = $1 AND user_id = $2",
      [propertyId, userId],
    );
    if (rows.length === 0) return null;
    return { history: rows[0].history ?? [], support: rows[0].support ?? [] };
  },
});
