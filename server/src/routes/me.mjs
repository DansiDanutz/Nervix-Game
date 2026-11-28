/** The caller's own identity and profile. */

import { resolveLevel, AccessError } from "../entitlement.mjs";
import { parseAvatarInput, avatarView } from "../avatar.mjs";
import { resolveUser } from "./guards.mjs";
import { createWriteLimiter } from "../write-limiter.mjs";

/** PUT /me/avatar budget per session user: each accepted write upserts a row and changes a broadcast appearance. */
export const AVATAR_WRITES_PER_WINDOW = 5;
export const AVATAR_WRITE_WINDOW_MS = 60_000;

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

/** The session user, or a 401: appearance is never read or written for anyone else. */
async function requireSessionUser(ctx, params) {
  const user = await resolveUser(ctx, params);
  if (!user) throw new AccessError("sign in to change your appearance", "unauthorized");
  return user;
}

export function createMeRoutes(ctx) {
  const { db } = ctx;
  const avatarWrites = createWriteLimiter({
    limit: AVATAR_WRITES_PER_WINDOW,
    windowMs: AVATAR_WRITE_WINDOW_MS,
    now: ctx.clock?.now ?? Date.now,
  });
  return {
    "GET /me": async (_b, params) => readMe(ctx, params),

    "POST /me/profile": async (body, params) => {
      const user = await resolveUser(ctx, params);
      if (!user) return { error: "unauthorized" };
      await db.store.completeProfile(user.id, body.displayName);
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
  };
}
