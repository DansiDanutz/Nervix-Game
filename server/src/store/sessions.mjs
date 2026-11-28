import { randomBytes } from "node:crypto";

const SESSION_ID_BYTES = 32;
/** Sign-in codes and sessions. Methods run with `this` bound to a PostgresStore. */

export const sessionMethods = Object.freeze({
  async createCode({ email, codeHash, expiresAt }) {
    const { rows } = await this.pool.query(
      `INSERT INTO verification_codes (email, code_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
      [email, codeHash, expiresAt],
    );
    return rows[0].id;
  },

  async latestCode(email) {
    const { rows } = await this.pool.query(
      `SELECT id, code_hash, expires_at, consumed_at FROM verification_codes
       WHERE email = $1 ORDER BY id DESC LIMIT 1`,
      [email],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, codeHash: r.code_hash, expiresAt: r.expires_at, consumedAt: r.consumed_at };
  },

  async consumeCode(id) {
    await this.pool.query("UPDATE verification_codes SET consumed_at = now() WHERE id = $1", [id]);
  },

  async createSession(userId, expiresAt) {
    const id = `sess_${randomBytes(SESSION_ID_BYTES).toString("hex")}`;
    await this.pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)", [id, userId, expiresAt]);
    return id;
  },

  async getSession(id) {
    if (!id) return null;
    const { rows } = await this.pool.query(
      "SELECT s.user_id, u.display_name, u.email_verified, u.profile_completed, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()", [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.user_id, displayName: r.display_name, emailVerified: r.email_verified, profileCompleted: r.profile_completed };
  },

  async deleteSession(id) {
    await this.pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  },
});
