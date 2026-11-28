/** Fixture avatars: each fixture user wears a distinct contract preset. Test/demo data only. */

// userId -> preset id from shared/contracts/avatar-presets.json
export const AVATARS = Object.freeze({
  usr_dangg: "burgundy",
  usr_test: "linen",
  usr_visitor: "teal",
  usr_sub: "traveller",
  usr_unverified: "sage",
  usr_admin_fixture: "terracotta",
});

export async function applyAvatars(q) {
  for (const [userId, preset] of Object.entries(AVATARS)) {
    await q(`INSERT INTO avatars (user_id, config, updated_at) VALUES ($1, jsonb_build_object('preset', $2::text), now())
             ON CONFLICT (user_id) DO UPDATE SET config = avatars.config || jsonb_build_object('preset', $2::text), updated_at = now()`,
      [userId, preset]);
  }
}
