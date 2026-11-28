/**
 * Avatar appearance persistence in the existing `avatars` table
 * (user_id primary key, config jsonb). Only `config.preset` is written.
 * C9 adds the caller's presence privacy settings (`presence_settings`,
 * migration 019) next to the appearance they govern.
 * Methods run with `this` bound to a PostgresStore.
 */

const settingsRow = (r) => Object.freeze({ hideName: r.hide_name, anonymous: r.anonymous, updatedAt: r.updated_at });

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

  /** The caller's presence privacy settings, or null when they have no row (names visible). */
  async getPresenceSettings(userId) {
    if (!userId) return null;
    const { rows } = await this.pool.query("SELECT hide_name, anonymous, updated_at FROM presence_settings WHERE user_id = $1", [userId]);
    return rows[0] ? settingsRow(rows[0]) : null;
  },

  /** Upserts both settings on this user's own row. */
  async setPresenceSettings(userId, { hideName, anonymous }) {
    const { rows } = await this.pool.query(
      `INSERT INTO presence_settings (user_id, hide_name, anonymous, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET hide_name = excluded.hide_name, anonymous = excluded.anonymous, updated_at = now()
       RETURNING hide_name, anonymous, updated_at`,
      [userId, hideName === true, anonymous === true],
    );
    return settingsRow(rows[0]);
  },
});
