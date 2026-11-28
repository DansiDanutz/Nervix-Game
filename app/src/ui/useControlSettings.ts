/**
 * The page's control-settings store and the hooks that read it. Storage is the
 * browser's localStorage, reached only through the guarded model functions.
 */
import { useEffect, useSyncExternalStore } from "react";
import { createControlSettingsStore, isReducedMotion, type ControlSettings, type StorageLike } from "./controlSettingsModel";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** localStorage, or null where even the accessor throws (blocked site data, sandboxed preview). */
function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const controlSettingsStore = createControlSettingsStore(browserStorage());

export function useControlSettings(): ControlSettings {
  return useSyncExternalStore(controlSettingsStore.subscribe, controlSettingsStore.get);
}

function motionQuery(): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  } catch {
    return null;
  }
}

function subscribeSystemMotion(listener: () => void): () => void {
  const q = motionQuery();
  q?.addEventListener("change", listener);
  return () => q?.removeEventListener("change", listener);
}

const systemPrefersReduced = () => motionQuery()?.matches ?? false;

/** The effective reduced-motion flag: the setting, or the OS preference under "system". */
export function useReducedMotion(): boolean {
  const settings = useControlSettings();
  const system = useSyncExternalStore(subscribeSystemMotion, systemPrefersReduced, () => false);
  return isReducedMotion(settings, system);
}

/** Mirrors the effective flag to <html data-reduced-motion>, which the a11y styles key on. */
export function useMotionPreferenceAttribute(): boolean {
  const reduced = useReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reducedMotion = String(reduced);
    return () => {
      delete root.dataset.reducedMotion;
    };
  }, [reduced]);
  return reduced;
}
