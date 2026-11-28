/** World-level public routes: health and the app directory. B-lanes add GET /world/houses here. */

import { DEMO_MODE } from "../nervixpay.demo.mjs";
import { APPS, publicApp } from "../apps.mjs";

export function createWorldRoutes() {
  return {
    "GET /health": () => ({ ok: true, demo: DEMO_MODE, uptime: process.uptime() }),

    "GET /apps": () => ({ apps: APPS.map(publicApp) }),
  };
}
