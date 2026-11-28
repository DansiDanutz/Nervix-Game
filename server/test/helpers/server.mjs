/** Starts the real API (src/index.mjs) as a child process for HTTP tests. */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVER_ENTRY = join(HERE, "..", "..", "src", "index.mjs");
const START_ATTEMPTS = 50;
const START_DELAY_MS = 100;

/** Env with live-payment and email secrets blanked, so tests never reach a provider. */
export function testEnv(extra = {}) {
  return { ...process.env, NODE_ENV: "test", NERVIXPAY_AGENT_TOKEN: "", NERVIXPAY_BASE_URL: "", RESEND_API_KEY: "", DATABASE_URL: "", ...extra };
}

export async function startServer({ port, env = {} }) {
  const child = spawn(process.execPath, [SERVER_ENTRY], { env: testEnv({ ...env, PORT: String(port) }), stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < START_ATTEMPTS; i++) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      if ((await fetch(`${base}/health`)).ok) return { base, stop: () => stopServer(child) };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, START_DELAY_MS));
  }
  stopServer(child);
  throw new Error("server did not start");
}

function stopServer(child) {
  if (child.exitCode === null) child.kill();
}
