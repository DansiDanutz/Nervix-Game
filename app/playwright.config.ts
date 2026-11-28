import { defineConfig } from "@playwright/test";

const API_PORT = 28797;
const WEB_PORT = 25183;
const DB = "nervix_world_slice_e2e";

/**
 * Slice E2E: real server (NODE_ENV=test, fixture subscribers) against a fresh
 * throwaway Postgres database, plus the Vite dev app. Never touches the dev DB.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // Reuse an already-cached browser when the pinned revision is not installed.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: [
    {
      command: `node ../server/src/index.mjs`,
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL: `postgres:///${DB}?host=%2Ftmp`,
        NERVIX_WORLD_TEST_SUBSCRIBER: "usr_dangg,usr_test,usr_sub,usr_unverified",
        NERVIXPAY_AGENT_TOKEN: "",
        RESEND_API_KEY: "",
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
