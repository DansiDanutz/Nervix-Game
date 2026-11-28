/** The caller's own identity and profile. */

import { resolveLevel } from "../entitlement.mjs";
import { resolveUser } from "./guards.mjs";

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

export function createMeRoutes(ctx) {
  const { db } = ctx;
  return {
    "GET /me": async (_b, params) => readMe(ctx, params),

    "POST /me/profile": async (body, params) => {
      const user = await resolveUser(ctx, params);
      if (!user) return { error: "unauthorized" };
      await db.store.completeProfile(user.id, body.displayName);
      return { ok: true, level: resolveLevel({ user: { ...user, profileCompleted: true } }) };
    },
  };
}
