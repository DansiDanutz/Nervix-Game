/**
 * The local player's avatar preset (C5): loaded from GET /me/avatar for the
 * signed-in session and updated by the avatar picker after a save. null until
 * known (the avatar then wears the default preset).
 */
import { useEffect, useSyncExternalStore } from "react";
import { api, isAvatarPresetId } from "../net/api";
import { createPresetStore } from "./presetStore";

export const myPresetStore = createPresetStore(isAvatarPresetId);

export function useMyPreset(userId: string): string | null {
  useEffect(() => {
    if (!userId) {
      myPresetStore.clear();
      return undefined;
    }
    let live = true;
    api
      .myAvatar()
      .then((a) => {
        if (live) myPresetStore.set(a.preset);
      })
      .catch((e) => console.warn("[avatar] saved preset unavailable; default look", e));
    return () => {
      live = false;
    };
  }, [userId]);
  return useSyncExternalStore(myPresetStore.subscribe, myPresetStore.get, myPresetStore.get);
}
