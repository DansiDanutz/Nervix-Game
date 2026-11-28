/**
 * Who a presence connection is (S4/C5), split out of presence.mjs. Identity
 * comes from the session, never from the client; the preset from the store
 * when it is a contract id; the C9 privacy settings from the store, failing
 * closed. No lookup ever throws.
 */
import { presetOrDefault } from "./presence-places.mjs";
import { DEFAULT_PRIVACY, FAIL_CLOSED_PRIVACY, privacyView, shownName } from "./presence-privacy.mjs";

const NAME_MAX = 40;
export const GUEST_NAME = "Guest";

/** The stored display name of a session user, trimmed and capped; GUEST_NAME when there is none. */
export function sessionName(user) {
  const name = typeof user?.displayName === "string" ? user.displayName.trim().slice(0, NAME_MAX) : "";
  return name || GUEST_NAME;
}

/** The server-side identity for one connection. Never derived from the client. */
export async function connectionIdentity(req, resolveSession, onError) {
  try {
    const user = await resolveSession(req);
    return user?.id ? { userId: user.id, name: sessionName(user) } : { userId: null, name: GUEST_NAME };
  } catch (error) {
    onError(new Error(`session lookup failed (${error?.message ?? error}); admitting as guest`));
    return { userId: null, name: GUEST_NAME };
  }
}

/** The stored preset when it is a contract id, otherwise a deterministic one. Never throws. */
export async function connectionPreset(userId, handle, resolvePreset, onError) {
  try {
    return presetOrDefault(userId ? await resolvePreset(userId) : null, userId ?? handle);
  } catch (error) {
    onError(new Error(`preset lookup failed (${error?.message ?? error}); using the default`));
    return presetOrDefault(null, userId ?? handle);
  }
}

/** A signed-in user's privacy settings; guests and users without a row get the default. A failed lookup is fully anonymous. */
export async function connectionPrivacy(userId, resolvePrivacy, onError) {
  if (!userId) return DEFAULT_PRIVACY;
  try {
    return privacyView(await resolvePrivacy(userId));
  } catch (error) {
    onError(new Error(`privacy lookup failed (${error?.message ?? error}); broadcasting as anonymous`));
    return FAIL_CLOSED_PRIVACY;
  }
}

/**
 * What others see of one connection: the shown name (guests stay GUEST_NAME)
 * and the preset. An anonymous user's preset comes from the handle only, never
 * the store or the user id, so it differs on every visit.
 */
export async function publicIdentity({ userId, name }, handle, { resolvePreset, resolvePrivacy, onError }) {
  const privacy = await connectionPrivacy(userId, resolvePrivacy, onError);
  if (privacy.anonymous) return Object.freeze({ name: shownName(name, privacy), preset: presetOrDefault(null, handle) });
  const preset = await connectionPreset(userId, handle, resolvePreset, onError);
  return Object.freeze({ name: userId ? shownName(name, privacy) : GUEST_NAME, preset });
}
