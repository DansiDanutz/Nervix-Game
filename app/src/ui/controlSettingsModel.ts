/**
 * CT5 control preferences: reduced motion, look sensitivity, invert Y and
 * optional pointer lock. Local to this browser (never sent to the server).
 * Pure: storage is injected and every read and write is guarded, so a private
 * window or blocked storage only means the defaults for this visit.
 */
export type MotionPreference = "system" | "on" | "off";

export interface ControlSettings {
  readonly reducedMotion: MotionPreference;
  /** Multiplier on the base look rate (drag and pointer lock). */
  readonly lookSensitivity: number;
  readonly invertY: boolean;
  readonly pointerLock: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CONTROL_SETTINGS_KEY = "nervix.controls.v1";
export const SENSITIVITY_RANGE = Object.freeze({ min: 0.25, max: 3, step: 0.25 });
export const MOTION_PREFERENCES: readonly MotionPreference[] = Object.freeze(["system", "on", "off"]);

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = Object.freeze({
  reducedMotion: "system",
  lookSensitivity: 1,
  invertY: false,
  pointerLock: false,
});

function clampSensitivity(v: number): number {
  const { min, max, step } = SENSITIVITY_RANGE;
  return Math.min(max, Math.max(min, Math.round(v / step) * step));
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Validate anything (stored JSON, an object, junk) into frozen settings; bad fields fall back to defaults. */
export function parseControlSettings(raw: unknown): ControlSettings {
  const r = asRecord(raw);
  const d = DEFAULT_CONTROL_SETTINGS;
  const motion = MOTION_PREFERENCES.find((m) => m === r.reducedMotion);
  const sens = typeof r.lookSensitivity === "number" && Number.isFinite(r.lookSensitivity) ? clampSensitivity(r.lookSensitivity) : d.lookSensitivity;
  return Object.freeze({
    reducedMotion: motion ?? d.reducedMotion,
    lookSensitivity: sens,
    invertY: typeof r.invertY === "boolean" ? r.invertY : d.invertY,
    pointerLock: typeof r.pointerLock === "boolean" ? r.pointerLock : d.pointerLock,
  });
}

/** A new settings value with one field changed (validated like stored data). */
export function withSetting<K extends keyof ControlSettings>(s: ControlSettings, key: K, value: ControlSettings[K]): ControlSettings {
  return parseControlSettings({ ...s, [key]: value });
}

/** Look delta (px or movement units) after sensitivity and invert Y; feed it to applyLook. */
export function scaleLook(s: ControlSettings, dx: number, dy: number): { dx: number; dy: number } {
  const k = s.lookSensitivity;
  return { dx: dx * k, dy: (s.invertY ? -dy : dy) * k };
}

/** "system" follows prefers-reduced-motion; "on" and "off" override it. */
export function isReducedMotion(s: ControlSettings, systemPrefersReduced: boolean): boolean {
  return s.reducedMotion === "system" ? systemPrefersReduced : s.reducedMotion === "on";
}

export function loadControlSettings(storage: StorageLike | null): ControlSettings {
  if (!storage) return DEFAULT_CONTROL_SETTINGS;
  try {
    const raw = storage.getItem(CONTROL_SETTINGS_KEY);
    return raw === null ? DEFAULT_CONTROL_SETTINGS : parseControlSettings(raw);
  } catch {
    return DEFAULT_CONTROL_SETTINGS;
  }
}

/** True when stored; false when storage is missing or refuses (quota, private mode). */
export function saveControlSettings(storage: StorageLike | null, s: ControlSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export interface ControlSettingsStore {
  get: () => ControlSettings;
  set: (next: ControlSettings) => void;
  subscribe: (listener: () => void) => () => void;
}

/** One store per page: loads once, keeps the value in memory and saves on every change. */
export function createControlSettingsStore(storage: StorageLike | null): ControlSettingsStore {
  let current = loadControlSettings(storage);
  let listeners: ReadonlyArray<() => void> = [];
  return {
    get: () => current,
    set: (next) => {
      if (next === current) return;
      current = next;
      saveControlSettings(storage, next);
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
