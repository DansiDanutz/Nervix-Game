/**
 * The Origin allow-list for presence upgrades (S4/C4), split out of
 * presence.mjs. Pure: reads only the request headers it is given.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export const parseOrigins = (value) => (value ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const hostnameOf = (host) => (host ?? "").replace(/:\d+$/, "").toLowerCase();

/**
 * May a page at `req.headers.origin` open a presence socket? No Origin means a
 * non-browser client, which carries no ambient cookie. Otherwise the origin
 * must be allowlisted, on the request's own host, or loopback talking to a
 * loopback host (the Vite dev proxy).
 */
export function originAllowed(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const originHost = parsed.hostname.toLowerCase();
  const requestHost = hostnameOf(req.headers.host);
  if (originHost === requestHost) return true;
  return LOOPBACK.has(originHost) && LOOPBACK.has(requestHost);
}
