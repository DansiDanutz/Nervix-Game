/**
 * App integration catalog.
 *
 * A merchant enables an app and supplies its configuration. Demo connectors are
 * always labelled demo and never described as live. Private credentials stay
 * server-side and are never returned to the client.
 */

export const APPS = Object.freeze([
  {
    id: "booking",
    name: "Booking Desk",
    category: "appointments",
    integration: "server-api",
    authRequired: true,
    configFields: Object.freeze(["calendar"]),
    actions: Object.freeze(["read_availability", "create_booking"]),
  },
  {
    id: "loyalty",
    name: "Loyalty Card",
    category: "retention",
    integration: "server-api",
    authRequired: true,
    configFields: Object.freeze(["programme"]),
    actions: Object.freeze(["read_balance", "issue_stamp"]),
  },
  {
    id: "arcade",
    name: "Arcade Table",
    category: "entertainment",
    integration: "embedded",
    authRequired: false,
    configFields: Object.freeze([]),
    actions: Object.freeze(["open_table"]),
  },
]);

export class AppError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppError";
  }
}

export function findApp(appId) {
  return APPS.find((a) => a.id === appId) ?? null;
}

/** Config must be an object carrying every declared field. */
export function validateConfig(app, config = {}) {
  if (typeof config !== "object" || config === null || Array.isArray(config)) throw new AppError("config must be an object");
  for (const field of app.configFields) {
    const value = config[field];
    if (typeof value !== "string" || value.trim().length === 0) throw new AppError(`missing config field ${field}`);
  }
  return Object.fromEntries(app.configFields.map((f) => [f, String(config[f]).slice(0, 200)]));
}

/** Demo connectors are never reported as live. */
export function healthFor(app) {
  return app.integration === "embedded" ? "demo" : "demo";
}

export function publicApp(app) {
  return {
    id: app.id, name: app.name, category: app.category,
    integration: app.integration, authRequired: app.authRequired,
    configFields: app.configFields, actions: app.actions,
  };
}