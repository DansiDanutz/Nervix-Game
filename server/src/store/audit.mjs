/** Audit events for platform and house decisions. Methods run with `this` bound to a PostgresStore. */

export const auditMethods = Object.freeze({
  async addAudit({ actorId, action, subject, detail = null }) {
    await this.pool.query(
      `INSERT INTO audit_events (actor_id, action, subject, detail) VALUES ($1, $2, $3, $4)`,
      [actorId, action, subject, detail ? JSON.stringify(detail) : null],
    );
  },

  async listAudit(limit = 50) {
    const { rows } = await this.pool.query(
      "SELECT id, actor_id, action, subject, detail, created_at FROM audit_events ORDER BY id DESC LIMIT $1",
      [limit],
    );
    return rows.map((r) => ({
      id: r.id, actorId: r.actor_id, action: r.action,
      subject: r.subject, detail: r.detail, createdAt: r.created_at,
    }));
  },
});
