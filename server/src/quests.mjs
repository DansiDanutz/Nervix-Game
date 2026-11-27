/**
 * The Lost Seals of the City.
 *
 * A player recovers three ceremonial seals through exploration and conversation.
 * Progress is sequential and idempotent; completion never requires a purchase or
 * a paid advertisement, and rewards stay separate from money.
 */

export const QUEST_ID = "lost-seals";

export const QUEST = Object.freeze({
  id: QUEST_ID,
  title: "The Lost Seals of the City",
  steps: Object.freeze([
    { id: "find-fountain", text: "Find the fountain in Central Plaza" },
    { id: "meet-guide", text: "Speak with the city guide" },
    { id: "seal-court", text: "Recover the seal in the Merchant Quarter" },
    { id: "seal-cafe", text: "Recover the seal in the Coffee Courtyard" },
    { id: "seal-venue", text: "Recover the seal in the Entertainment District" },
  ]),
  seals: Object.freeze(["seal-court", "seal-cafe", "seal-venue"]),
});

export function newProgress() {
  return { questId: QUEST_ID, stepIndex: 0, seals: [], completed: false };
}

/** Advance one step at a time; re-sending the same step changes nothing. */
export function advance(progress, stepId) {
  const index = QUEST.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return { progress, error: "unknown_step" };
  if (progress.completed) return { progress, error: "already_completed" };
  if (index < progress.stepIndex) return { progress, error: "already_done" };
  if (index > progress.stepIndex) return { progress, error: "out_of_order" };

  const stepIndex = progress.stepIndex + 1;
  return { progress: { ...progress, stepIndex }, error: null };
}

/** Seals are unique and only count once their step is reached. */
export function collectSeal(progress, sealId) {
  if (!QUEST.seals.includes(sealId)) return { progress, error: "unknown_seal" };
  const stepIndex = QUEST.steps.findIndex((s) => s.id === sealId);
  if (stepIndex > progress.stepIndex) return { progress, error: "seal_locked" };
  if (progress.seals.includes(sealId)) return { progress, error: "already_collected" };

  const seals = [...progress.seals, sealId];
  const completed = QUEST.seals.every((s) => seals.includes(s));
  return { progress: { ...progress, seals, completed }, error: null };
}

export function isComplete(progress) {
  return progress.completed === true;
}