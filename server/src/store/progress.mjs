/** Quest progress per user. Methods run with `this` bound to a PostgresStore. */

export const progressMethods = Object.freeze({
  async getProgress(userId, questId) {
    const { rows } = await this.pool.query(
      "SELECT step_index, completed, seals FROM progress WHERE user_id = $1 AND quest_id = $2",
      [userId, questId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { questId, stepIndex: r.step_index, seals: r.seals ?? [], completed: r.completed };
  },

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
  },
});
