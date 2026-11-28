/**
 * Presence. There are no HTTP routes: identity is read from the session cookie
 * on the WebSocket upgrade (S4), so no ticket endpoint is needed.
 *
 * `presenceSessionResolver(ctx)` is what src/index.mjs passes to
 * attachPresence, so presence uses the same session lookup as every route.
 */

import { resolveUser } from "./guards.mjs";

export function createPresenceRoutes() {
  return {};
}

/** (req) => the session user ({ id, displayName }) or null, from the upgrade request's cookie. */
export function presenceSessionResolver(ctx) {
  return (req) => resolveUser(ctx, { req });
}
