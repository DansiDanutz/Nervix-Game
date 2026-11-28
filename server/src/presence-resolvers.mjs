/**
 * Store-backed lookups for presence (C3): is a prop_* id a real property, and
 * which avatar preset has a user stored (C5, `store.getAvatar(userId)` -> { preset } | null). Without
 * a store (in-memory demo) there are no extra properties and no stored preset,
 * so presence falls back to the contract places and a deterministic preset.
 *
 * Only published properties open a room: a draft house id reveals nobody.
 * The preset is read once, at join; a PUT /me/avatar change shows to others
 * after the player reconnects (C5 may push a refresh later). The C9 privacy
 * settings are read the same way, once per connection.
 *
 * src/index.mjs passes these to attachPresence next to resolveSession.
 */

export function presenceStoreResolvers(ctx) {
  const store = () => ctx.db.store;
  return Object.freeze({
    async isKnownProperty(propertyId) {
      const s = store();
      if (!s?.getProperty) return false;
      return (await s.getProperty(propertyId))?.published === true; // drafts get no room
    },
    /** C9: the user's presence privacy settings ({ hideName, anonymous }) or null. Errors reach presence, which fails closed. */
    async resolvePrivacy(userId) {
      const s = store();
      if (!userId || typeof s?.getPresenceSettings !== "function") return null;
      const row = await s.getPresenceSettings(userId);
      return row ? Object.freeze({ hideName: row.hideName, anonymous: row.anonymous }) : null;
    },
    async resolvePreset(userId) {
      const s = store();
      if (!userId || typeof s?.getAvatar !== "function") return null;
      return (await s.getAvatar(userId))?.preset ?? null;
    },
  });
}
