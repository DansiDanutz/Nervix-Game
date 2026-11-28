import { useEffect } from "react";
import type { Marker } from "../scene/CityScene";
import { api, type QuestProgress, type Session } from "../net/api";
import { isTypingTarget, keyName } from "../input/keys";
import type { Place } from "../world/place";
import type { Target } from "../world/targets";

interface WorldKeys {
  session: Session | null;
  nearby: Marker | null;
  quest: QuestProgress | null;
  place: Place;
  target: Target | null;
  goPlaza: () => void;
  activate: (t: Target) => void;
  toggleGuide: () => void;
  closeGuide: () => void;
  onQuest: (q: QuestProgress) => void;
}

/** Shell keys: G guide, Esc back to the plaza, E/Enter doors, E collects seals. */
export function useWorldKeys(k: WorldKeys) {
  const { session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest } = k;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = keyName(e);
      if (key === "g") toggleGuide();
      if (key === "escape") {
        closeGuide();
        if (place.kind !== "plaza") goPlaza();
        return;
      }
      if ((key === "e" || key === "enter") && target) {
        activate(target);
        return;
      }
      if (key !== "e" || !session || !nearby) return;
      if (!nearby.id.toLowerCase().includes("seal") || quest?.seals.includes(nearby.id)) return;
      void api.collectSeal(session.userId, nearby.id).then((r) => onQuest(r.progress));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest]);
}
