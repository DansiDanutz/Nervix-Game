/**
 * Nervix World demo API — node:http, in-memory state with optional Postgres.
 *
 * Demo only. No real identity provider, no real payments. Every state change
 * is server-side; the client never supplies authoritative amounts or payees.
 * Routes live in ./routes/*.mjs (registry: ./routes/index.mjs).
 *
 *   PORT=8787 node src/index.mjs
 */

import http from "node:http";
import { DEMO_MODE } from "./nervixpay.demo.mjs";
import { attachPresence } from "./presence.mjs";
import { createContext } from "./routes/context.mjs";
import { presenceSessionResolver } from "./routes/presence.mjs";
import { createRoutes } from "./routes/index.mjs";
import { createRequestHandler } from "./routes/dispatch.mjs";

const DEFAULT_PORT = 8787;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

const ctx = createContext();
const server = http.createServer(createRequestHandler(createRoutes(ctx)));

attachPresence(server, { resolveSession: presenceSessionResolver(ctx) });

async function boot() {
  const { db } = ctx;
  if (db.store) {
    db.properties = await db.store.listProperties();
    db.campaigns = await db.store.listCampaigns();
    console.log(`loaded ${db.properties.length} properties, ${db.campaigns.length} campaigns from Postgres`);
  }
  server.listen(PORT, () => console.log(`nervix-world demo API on :${PORT} (demo=${DEMO_MODE})`));
}

boot();
