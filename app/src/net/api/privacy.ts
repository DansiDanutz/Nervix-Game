/**
 * Presence privacy (C9): the /me/privacy endpoints. `hideName` shows others
 * "Anonymous" instead of your display name; `anonymous` also swaps your saved
 * appearance for a per-visit one. Identity is the session, so no userId is
 * ever sent. Settings apply from your next presence connection.
 */
import type { Call } from "./http";

export interface PrivacySettings {
  readonly hideName: boolean;
  readonly anonymous: boolean;
}

/** GET/PUT /me/privacy response: `default` until the player saves once. */
export interface MyPrivacy extends PrivacySettings {
  readonly source: "saved" | "default";
}

/** The label the server broadcasts for a hidden name (server/src/presence-privacy.mjs). */
export const ANON_NAME = "Anonymous";
export const DEFAULT_PRIVACY: PrivacySettings = Object.freeze({ hideName: false, anonymous: false });

const bool = (value: unknown) => value === true;

/** A response body read defensively: anything but a real `true` is false. */
export function parseMyPrivacy(body: unknown): MyPrivacy {
  const b = (body ?? {}) as Record<string, unknown>;
  return Object.freeze({ hideName: bool(b.hideName), anonymous: bool(b.anonymous), source: b.source === "saved" ? "saved" : "default" });
}

export const isNameHidden = (p: PrivacySettings) => p.hideName || p.anonymous;

/** The name other players see for these settings. */
export const shownAs = (p: PrivacySettings, displayName: string) => (isNameHidden(p) ? ANON_NAME : displayName);

export const privacyEndpoints = (call: Call) => ({
  myPrivacy: async () => parseMyPrivacy(await call<unknown>("/me/privacy")),
  savePrivacy: async ({ hideName, anonymous }: PrivacySettings) =>
    parseMyPrivacy(await call<unknown>("/me/privacy", { hideName, anonymous }, "PUT")),
});
