// Fresh throwaway database for every E2E run: migrations + slice fixtures only.
// Runs before Playwright because webServer starts before globalSetup.
// E2E_DB picks the database (default nervix_world_slice_e2e; must contain _e2e),
// so two runs with their own E2E_API_PORT/E2E_WEB_PORT/E2E_DB never collide.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePlan, runPlan } from "./helpers/prepare.mjs";

const server = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "server");

runPlan(preparePlan(process.env, server));
