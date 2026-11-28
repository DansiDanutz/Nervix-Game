import type { Call } from "./http";
import type { QuestProgress } from "./types";

export const questEndpoints = (call: Call) => ({
  progress: (userId: string) => call<{ progress: QuestProgress }>(`/progress?userId=${encodeURIComponent(userId)}`),
  collectSeal: (userId: string, seal: string) => call<{ progress: QuestProgress }>("/progress", { userId, seal }),
  advance: (userId: string, step: string) => call<{ progress: QuestProgress }>("/progress", { userId, step }),
});
