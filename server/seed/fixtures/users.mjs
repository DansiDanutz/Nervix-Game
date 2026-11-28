/** Fixture users and their sessions. Test/demo data only. */

export const SUBSCRIBERS = ["usr_dangg", "usr_test", "usr_sub", "usr_unverified"];

export const SESSIONS = Object.freeze({
  dangg: "sess_fixture_dangg",
  test: "sess_fixture_test",
  visitor: "sess_fixture_visitor",
  sub: "sess_fixture_sub",
  unverified: "sess_fixture_unverified",
  admin: "sess_fixture_admin",
});

/** Session key -> fixture user id. */
export const SESSION_OWNERS = Object.freeze({
  dangg: "usr_dangg",
  test: "usr_test",
  visitor: "usr_visitor",
  sub: "usr_sub",
  unverified: "usr_unverified",
  admin: "usr_admin_fixture",
});

// [id, displayName, role]
export const USERS = Object.freeze([
  ["usr_dangg", "DanGG", "player"],
  ["usr_test", "Test Builder", "player"],
  ["usr_visitor", "Visitor", "player"],
  ["usr_sub", "Subscriber Only", "player"],
  ["usr_unverified", "Unverified Merchant", "player"],
  ["usr_admin_fixture", "Fixture Admin", "admin"],
]);

export async function applyUsers(q) {
  for (const [id, name, role] of USERS) {
    await q(`INSERT INTO users (id, email, display_name, role, email_verified, profile_completed)
             VALUES ($1, $2, $3, $4, true, true)
             ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, role = excluded.role,
               email_verified = true, profile_completed = true`,
      [id, `${id}@fixture.nervix.invalid`, name, role]);
  }
}

export async function applySessions(q) {
  for (const [key, sid] of Object.entries(SESSIONS)) {
    await q(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')
             ON CONFLICT (id) DO UPDATE SET expires_at = excluded.expires_at`, [sid, SESSION_OWNERS[key]]);
  }
}
