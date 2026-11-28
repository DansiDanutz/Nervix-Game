/**
 * The Lost Seals quest and per-user progress (S2). Progress belongs to the
 * session user; a `userId` in the query or body is ignored. A signed-out
 * reader gets a fresh, unsaved quest and cannot write.
 */

import { AccessError } from "../entitlement.mjs";
import { QUEST, newProgress, advance, collectSeal } from "../quests.mjs";
import { resolveUser } from "./guards.mjs";

export function createProgressRoutes(ctx) {
  const { db } = ctx;

  async function storedProgress(userId) {
    return (db.store ? await db.store.getProgress(userId, QUEST.id) : null) ?? newProgress();
  }

  return {
    "GET /quests/lost-seals": () => ({ quest: QUEST }),

    "GET /progress": async (_b, params) => {
      const user = await resolveUser(ctx, params);
      return { progress: user ? await storedProgress(user.id) : newProgress() };
    },

    "POST /progress": async (body, params) => {
      const user = await resolveUser(ctx, params);
      if (!user) throw new AccessError("sign in to save quest progress", "unauthorized");
      const stored = await storedProgress(user.id);
      const result = body.seal ? collectSeal(stored, body.seal) : advance(stored, body.step);
      if (result.error) return { error: result.error, progress: result.progress };
      if (db.store) {
        const p = result.progress;
        await db.store.saveProgress({ userId: user.id, questId: QUEST.id, stepIndex: p.stepIndex, seals: p.seals, completed: p.completed });
      }
      return { progress: result.progress };
    },
  };
}
