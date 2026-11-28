/**
 * Avatar appearance persistence in the existing `avatars` table
 * (user_id primary key, config jsonb). Only `config.preset` is written.
 * Methods run with `this` bound to a PostgresStore.
 */

export const avatarMethods = Object.freeze({
  /** The caller's stored appearance, or null when they have no row. */
  async getAvatar(userId) {
    if (!userId) return null;
    const { rows } = await this.pool.query("SELECT config->>'preset' AS preset, updated_at FROM avatars WHERE user_id = $1", [userId]);
    return rows[0] ? Object.freeze({ preset: rows[0].preset, updatedAt: rows[0].updated_at }) : null;
  },

  /** Upserts the preset on this user's own row; other config keys are kept. */
  async setAvatarPreset(userId, preset) {
    const { rows } = await this.pool.query(
      `INSERT INTO avatars (user_id, config, updated_at) VALUES ($1, jsonb_build_object('preset', $2::text), now())
       ON CONFLICT (user_id) DO UPDATE SET config = avatars.config || jsonb_build_object('preset', $2::text), updated_at = now()
       RETURNING config->>'preset' AS preset, updated_at`,
      [userId, preset],
    );
    return Object.freeze({ preset: rows[0].preset, updatedAt: rows[0].updated_at });
  },
});
