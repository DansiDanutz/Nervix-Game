/**
 * C9 review fix: the display-name policy holds on every write path, not only
 * POST /me/profile. Email signup and the demo session store a name only when
 * it passes the policy; otherwise, and when no name is given, they store the
 * neutral NEUTRAL_DISPLAY_NAME, never the email's local part.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSessionRoutes, NEUTRAL_DISPLAY_NAME } from "../src/routes/session.mjs";
import { validateDisplayName } from "../src/display-name.mjs";

/** Routes over an in-memory store that records the names it was asked to store. */
function routesWithStore() {
  const stored = [];
  const store = {
    createUser: async (user) => { stored.push(user.displayName); },
    createCode: async () => {},
    ensureUser: async (_id, displayName) => { stored.push(displayName); },
  };
  return { stored, routes: createSessionRoutes({ db: { store, email: { available: false } } }) };
}

test("the neutral default name itself passes the display-name policy", () => {
  assert.equal(validateDisplayName(NEUTRAL_DISPLAY_NAME).ok, true);
});

test("signup with a disallowed display name stores the neutral default", async () => {
  for (const bad of ["Sh1t Lord", "usr_dangg", "Admin", "x", "see https://evil.example"]) {
    const { stored, routes } = routesWithStore();
    const res = await routes["POST /auth/signup"]({ email: "dan@example.invalid", displayName: bad });
    assert.equal(res.displayName, NEUTRAL_DISPLAY_NAME, bad);
    assert.deepEqual(stored, [NEUTRAL_DISPLAY_NAME], bad);
  }
});

test("signup without a display name never uses the email local part", async () => {
  const { stored, routes } = routesWithStore();
  const res = await routes["POST /auth/signup"]({ email: "private.person@example.invalid" });
  assert.equal(res.displayName, NEUTRAL_DISPLAY_NAME);
  assert.doesNotMatch(JSON.stringify(stored), /private\.person/);
});

test("signup with an allowed display name stores the cleaned name", async () => {
  const { stored, routes } = routesWithStore();
  const res = await routes["POST /auth/signup"]({ email: "dan@example.invalid", displayName: "  Dan   GG " });
  assert.equal(res.displayName, "Dan GG");
  assert.deepEqual(stored, ["Dan GG"]);
});

test("the demo session path applies the same policy", async () => {
  const { stored, routes } = routesWithStore();
  const bad = await routes["POST /session"]({ displayName: "Moderator" });
  const good = await routes["POST /session"]({ displayName: "Wanderer" });
  const none = await routes["POST /session"]({});
  assert.deepEqual([bad.displayName, good.displayName, none.displayName], [NEUTRAL_DISPLAY_NAME, "Wanderer", NEUTRAL_DISPLAY_NAME]);
  assert.deepEqual(stored, [NEUTRAL_DISPLAY_NAME, "Wanderer", NEUTRAL_DISPLAY_NAME]);
});
