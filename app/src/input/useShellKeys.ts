import { useEffect } from "react";
import type { Marker } from "../scene/CityScene";
import { api, type QuestProgress, type Session } from "../net/api";
import type { Place } from "../world/place";
import type { Target } from "../world/targets";
import { escapeLayers } from "./escapeLayers";
import { shellKeyActions, type ShellAction } from "./keys";
import { shellInput } from "./shellInput";

export interface ShellKeys {
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

const isSeal = (m: Marker) => m.id.toLowerCase().includes("seal");

function canCollect({ session, nearby, quest }: ShellKeys): boolean {
  return !!session && !!nearby && isSeal(nearby) && !quest?.seals.includes(nearby.id);
}

function run(action: ShellAction, k: ShellKeys) {
  if (action === "toggle-guide") k.toggleGuide();
  else if (action === "close-panels") escapeLayers.closeTop();
  else if (action === "close-guide") k.closeGuide();
  else if (action === "leave-place") k.goPlaza();
  else if (action === "activate-target" && k.target) k.activate(k.target);
  else if (action === "collect-seal" && k.session && k.nearby) {
    void api.collectSeal(k.session.userId, k.nearby.id).then((r) => k.onQuest(r.progress));
  }
}

/**
 * Shell keys (drop-in for shell/useWorldKeys): G guide, Esc closes open side
 * panels first and only then leaves, E/Enter doors (never Enter on a focused
 * button, never auto-repeat), E collects seals. Only visible registered layers
 * count as open panels, in every place (a hidden side column never holds Esc back).
 */
export function useShellKeys(k: ShellKeys) {
  const { session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest } = k;
  useEffect(() => {
    const keys: ShellKeys = { session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest };
    const onKey = (e: KeyboardEvent) => {
      const state = { placeKind: place.kind, hasTarget: target !== null, canCollectSeal: canCollect(keys) };
      const actions = shellKeyActions(shellInput(e, state, escapeLayers));
      actions.forEach((a) => run(a, keys));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest]);
}
