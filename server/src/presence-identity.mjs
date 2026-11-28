/**
 * Who a presence connection is (S4/C5), split out of presence.mjs. Identity
 * comes from the session, never from the client; the preset from the store
 * when it is a contract id. Neither lookup ever throws.
 */
import { presetOrDefault } from "./presence-places.mjs";

const NAME_MAX = 40;
export const GUEST_NAME = "Guest";

/** The server-side identity for one connection. Never derived from the client. */
export async function connectionIdentity(req, resolveSession, onError) {
  try {
    const user = await resolveSession(req);
    const name = typeof user?.displayName === "string" ? user.displayName.trim().slice(0, NAME_MAX) : "";
    return user?.id ? { userId: user.id, name: name || GUEST_NAME } : { userId: null, name: GUEST_NAME };
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
