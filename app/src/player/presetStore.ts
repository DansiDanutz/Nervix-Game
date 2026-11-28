/**
 * C5/C7 hookup glue: the local player's avatar preset, shared by the avatar
 * picker (after a save) and the local SkinnedAvatar. Memory only; the server
 * holds the saved choice (GET/PUT /me/avatar). Pure; the validator is injected.
 */

export interface PresetStore {
  get: () => string | null;
  set: (preset: string) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPresetStore(isKnown: (value: unknown) => value is string): PresetStore {
  let current: string | null = null;
  let listeners: ReadonlyArray<() => void> = [];
  const commit = (next: string | null) => {
    if (next === current) return;
    current = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => current,
    set: (preset) => {
      if (isKnown(preset)) commit(preset);
    },
    clear: () => commit(null),
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
