/**
 * Route registry. Each module owns a disjoint set of "METHOD /path" keys; the
 * registry merges them and refuses duplicates. Dispatch matches the exact key
 * first, then the first parameterised pattern for the method.
 */

import { createSessionRoutes } from "./session.mjs";
import { createMeRoutes } from "./me.mjs";
import { createMerchantRoutes } from "./merchants.mjs";
import { createBusinessRoutes } from "./businesses.mjs";
import { createBuilderRoutes } from "./builders.mjs";
import { createHouseRoutes } from "./houses.mjs";
import { createOrderRoutes } from "./orders.mjs";
import { createProgressRoutes } from "./progress.mjs";
import { createAgentRoutes } from "./agent.mjs";
import { createAdminRoutes } from "./admin.mjs";
import { createPresenceRoutes } from "./presence.mjs";
import { createWorldRoutes } from "./world.mjs";
import { createCampaignRoutes } from "./campaigns.mjs";

export const ROUTE_MODULES = Object.freeze({
  world: createWorldRoutes,
  session: createSessionRoutes,
  me: createMeRoutes,
  merchants: createMerchantRoutes,
  admin: createAdminRoutes,
  businesses: createBusinessRoutes,
  builders: createBuilderRoutes,
  houses: createHouseRoutes,
  progress: createProgressRoutes,
  orders: createOrderRoutes,
  agent: createAgentRoutes,
  campaigns: createCampaignRoutes,
  presence: createPresenceRoutes,
});

export function createRoutes(ctx) {
  const routes = {};
  for (const [name, factory] of Object.entries(ROUTE_MODULES)) {
    for (const [key, handler] of Object.entries(factory(ctx))) {
      if (Object.hasOwn(routes, key)) throw new Error(`route ${key} (${name}) is registered twice`);
      routes[key] = handler;
    }
  }
  return Object.freeze(routes);
}

const PARAM = /:(\w+)/g;

/** Precompiled parameterised patterns, in registry order. */
function compile(routes) {
  return Object.keys(routes).map((route) => {
    const [method, pattern] = route.split(" ");
    const names = [...pattern.matchAll(PARAM)].map((m) => m[1]);
    return { route, method, names, re: new RegExp(`^${pattern.replace(PARAM, "([^/]+)")}$`) };
  });
}

const compiled = new WeakMap();

/** Finds the handler for a method and path: { key, handler, params } (handler undefined when none). */
export function matchRoute(routes, method, path) {
  const key = `${method} ${path}`;
  if (routes[key]) return { key, handler: routes[key], params: {} };
  if (!compiled.has(routes)) compiled.set(routes, compile(routes));
  for (const { route, method: m, names, re } of compiled.get(routes)) {
    if (m !== method) continue;
    const found = re.exec(path);
    if (!found) continue;
    return { key: route, handler: routes[route], params: Object.fromEntries(names.map((n, i) => [n, found[i + 1]])) };
  }
  return { key: null, handler: undefined, params: {} };
}
