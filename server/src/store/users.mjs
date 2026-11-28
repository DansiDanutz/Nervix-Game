/** Users: identity rows, admin role and profile completion. Methods run with `this` bound to a PostgresStore. */

export const userMethods = Object.freeze({
  async ensureUser(id, displayName = "Traveler") {
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, role) VALUES ($1, $2, $3, 'player')
       ON CONFLICT (id) DO NOTHING`,
      [id, `${id}@demo.nervix.invalid`, displayName],
    );
  },

  async createUser({ id, email, displayName, verified = false }) {
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, role, email_verified)
       VALUES ($1, $2, $3, 'player', $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, email, displayName, verified],
    );
  },

  async findUserByEmail(email) {
    const { rows } = await this.pool.query("SELECT id, display_name, email_verified, role FROM users WHERE email = $1", [email]);
    return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name, verified: rows[0].email_verified, role: rows[0].role } : null;
  },

  async markVerified(userId) {
    await this.pool.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
  },

  async findUser(userId) {
    if (!userId) return null;
    const { rows } = await this.pool.query(
      "SELECT id, display_name, email_verified, role FROM users WHERE id = $1", [userId]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, displayName: r.display_name, emailVerified: r.email_verified, role: r.role };
  },

  async isAdmin(userId) {
    const { rows } = await this.pool.query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role === "admin";
  },

  async completeProfile(userId, displayName) {
    await this.pool.query("UPDATE users SET profile_completed = true, display_name = COALESCE($2, display_name) WHERE id = $1", [userId, displayName ?? null]);
  },
});
