/**
 * C8 fixture walkers: DEMO-only pedestrians that server/scripts/fixture-walkers.mjs
 * walks around the plaza over the presence socket. Fictional names, test/demo
 * data only: they are never real NervixPay users and own nothing. Each has its
 * own fixture user, session and contract avatar preset. Idempotent.
 */

// [key, display name (must pass the display-name policy: no brackets), preset id from shared/contracts/avatar-presets.json]
const WALKER_ROWS = Object.freeze([
  ["ada", "Demo Ada", "teal"],
  ["bram", "Demo Bram", "terracotta"],
  ["cleo", "Demo Cleo", "linen"],
  ["dario", "Demo Dario", "traveller"],
  ["elin", "Demo Elin", "sage"],
  ["femi", "Demo Femi", "burgundy"],
  ["gwen", "Demo Gwen", "linen"],
  ["hugo", "Demo Hugo", "teal"],
]);

export const WALKERS = Object.freeze(WALKER_ROWS.map(([key, name, preset]) => Object.freeze({
  key,
  userId: `usr_walker_${key}`,
  sessionId: `sess_fixture_walker_${key}`,
  name,
  preset,
})));

const SESSION_IDS = new Set(WALKERS.map((w) => w.sessionId));

/** Is `walker` exactly one of the listed fixture walkers (same user, session and name)? */
export function isFixtureWalker(walker) {
  if (!walker || !SESSION_IDS.has(walker.sessionId)) return false;
  const listed = WALKERS.find((w) => w.sessionId === walker.sessionId);
  return listed.userId === walker.userId && listed.name === walker.name;
}

export async function applyWalkers(q) {
  for (const w of WALKERS) {
    await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $3, 'player', true, true)
             ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, email_verified = true, profile_completed = true`,
      [w.userId, `${w.userId}@fixture.nervix.invalid`, w.name]);
    await q(`INSERT INTO avatars (user_id, config, updated_at) VALUES ($1, jsonb_build_object('preset', $2::text), now())
             ON CONFLICT (user_id) DO UPDATE SET config = avatars.config || jsonb_build_object('preset', $2::text), updated_at = now()`,
      [w.userId, w.preset]);
    await q(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')
             ON CONFLICT (id) DO UPDATE SET expires_at = excluded.expires_at`, [w.sessionId, w.userId]);
  }
}
