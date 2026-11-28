/**
 * Postgres persistence.
 *
 * The in-memory store is the default for tests; set DATABASE_URL to persist.
 * Orders are written transactionally (order + items together) and ids are the
 * application's stable text ids, so a retry updates rather than duplicates.
 *
 * The methods live in domain modules under ./store/ and are installed on the
 * PostgresStore prototype, so the public API is one class as before.
 */

import pg from "pg";

import { userMethods } from "./store/users.mjs";
import { sessionMethods } from "./store/sessions.mjs";
import { merchantMethods } from "./store/merchants.mjs";
import { productMethods } from "./store/products.mjs";
import { appMethods } from "./store/apps.mjs";
import { houseMethods } from "./store/houses.mjs";
import { offeringMethods } from "./store/offerings.mjs";
import { orderMethods } from "./store/orders.mjs";
import { progressMethods } from "./store/progress.mjs";
import { conversationMethods } from "./store/conversations.mjs";
import { agentMethods } from "./store/agents.mjs";
import { campaignMethods } from "./store/campaigns.mjs";
import { auditMethods } from "./store/audit.mjs";
import { avatarMethods } from "./store/avatars.mjs";

const { Pool } = pg;

export const STORE_MODULES = Object.freeze({
  users: userMethods,
  sessions: sessionMethods,
  merchants: merchantMethods,
  products: productMethods,
  apps: appMethods,
  houses: houseMethods,
  offerings: offeringMethods,
  orders: orderMethods,
  progress: progressMethods,
  conversations: conversationMethods,
  agents: agentMethods,
  campaigns: campaignMethods,
  audit: auditMethods,
  avatars: avatarMethods,
});

export class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async close() {
    await this.pool.end();
  }
}

/** Installs each domain's methods once; a name defined twice is a wiring bug. */
function installMethods(target, modules) {
  for (const [domain, methods] of Object.entries(modules)) {
    for (const [name, fn] of Object.entries(methods)) {
      if (Object.hasOwn(target, name)) throw new Error(`store method ${name} (${domain}) is defined twice`);
      Object.defineProperty(target, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }
  }
}

installMethods(PostgresStore.prototype, STORE_MODULES);
