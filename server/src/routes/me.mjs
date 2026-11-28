/** The caller's own identity and profile. */

import { resolveLevel, AccessError } from "../entitlement.mjs";
import { parseAvatarInput, avatarView } from "../avatar.mjs";
import { resolveUser } from "./guards.mjs";
import { createWriteLimiter } from "../write-limiter.mjs";
import { assertDisplayName } from "../display-name.mjs";
import { mergePrivacyInput, privacyView } from "../presence-privacy.mjs";

/** PUT /me/avatar budget per session user: each accepted write upserts a row and changes a broadcast appearance. */
export const AVATAR_WRITES_PER_WINDOW = 5;
export const AVATAR_WRITE_WINDOW_MS = 60_000;
/** PUT /me/privacy budget per session user (C9). */
export const PRIVACY_WRITES_PER_WINDOW = 10;
export const PRIVACY_WRITE_WINDOW_MS = 60_000;

/** The GET /me payload; other routes use it to read the caller's level. */
export async function readMe(ctx, params) {
  const user = await resolveUser(ctx, params);
  const level = resolveLevel({ user });
  return {
    userId: user?.id ?? null,
    displayName: user?.displayName ?? null,
    emailVerified: user?.emailVerified ?? false,
    profileCompleted: user?.profileCompleted ?? false,
    level,
    subscription: { active: level === "build", source: "unavailable" },
  };
}

/** The session user, or a 401: appearance and privacy are never read or written for anyone else. */
async function requireSessionUser(ctx, params, what = "your appearance") {
  const user = await resolveUser(ctx, params);
  if (!user) throw new AccessError(`sign in to change ${what}`, "unauthorized");
  return user;
}

/**
 * C9: after a saved privacy change, re-applies the caller's shown name and
 * preset on any open presence socket at once (index.mjs sets `db.presence` to
 * the attachPresence server). Without it the next session recheck applies the
 * change. A failed refresh is logged and never fails the saved settings.
 */
async function refreshPresence(db, userId) {
  try {
    await db.presence?.refreshUser?.(userId);
  } catch (error) {
    console.error(`presence refresh after a privacy change failed: ${error?.message ?? error}`);
  }
}

/** The GET/PUT /me/privacy payload: the two settings and whether they were saved. */
const privacyResponse = (row) => Object.freeze({ ...privacyView(row), source: row ? "saved" : "default" });

export function createMeRoutes(ctx) {
  const { db } = ctx;
  const now = ctx.clock?.now ?? Date.now;
  const avatarWrites = createWriteLimiter({ limit: AVATAR_WRITES_PER_WINDOW, windowMs: AVATAR_WRITE_WINDOW_MS, now });
  const privacyWrites = createWriteLimiter({ limit: PRIVACY_WRITES_PER_WINDOW, windowMs: PRIVACY_WRITE_WINDOW_MS, now });
  return {
    "GET /me": async (_b, params) => readMe(ctx, params),

    "POST /me/profile": async (body, params) => {
      const user = await resolveUser(ctx, params);
      if (!user) return { error: "unauthorized" };
      // C9: a name others can see must pass the display-name policy; omitted keeps the current one.
      const displayName = body.displayName === undefined ? undefined : assertDisplayName(body.displayName);
      await db.store.completeProfile(user.id, displayName);
      return { ok: true, level: resolveLevel({ user: { ...user, profileCompleted: true } }) };
    },

    "GET /me/avatar": async (_b, params) => {
      const user = await requireSessionUser(ctx, params);
      return avatarView(await db.store.getAvatar(user.id));
    },

    "PUT /me/avatar": async (body, params) => {
      const user = await requireSessionUser(ctx, params);
      const { preset } = parseAvatarInput(body);
      if (!avatarWrites.take(user.id)) throw new AccessError("too many appearance changes; try again in a minute", "cap_reached");
      return avatarView(await db.store.setAvatarPreset(user.id, preset));
    },

    "GET /me/privacy": async (_b, params) => {
      const user = await requireSessionUser(ctx, params, "your privacy settings");
      return privacyResponse(await db.store.getPresenceSettings(user.id));
    },

    "PUT /me/privacy": async (body, params) => {
      const user = await requireSessionUser(ctx, params, "your privacy settings");
      const current = await db.store.getPresenceSettings(user.id);
      const next = mergePrivacyInput(current, body);
      if (!privacyWrites.take(user.id)) throw new AccessError("too many privacy changes; try again in a minute", "cap_reached");
      const saved = await db.store.setPresenceSettings(user.id, next);
      await refreshPresence(db, user.id);
      return privacyResponse(saved);
    },
  };
}
