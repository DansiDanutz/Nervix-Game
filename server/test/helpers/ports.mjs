/**
 * Test port selection. Ports come from the 28000 + pid % 700 pattern, shifted by
 * 1000 per slot so one test file can run several servers. Ports owned by other
 * services or by the E2E run are never returned.
 */
import net from "node:net";

export const RESERVED_PORTS = Object.freeze([8787, 18787, 28797, 25183]);
const BASE = 28000;
const SPREAD = 700;
const SLOT_STRIDE = 1000;
const MAX_PROBES = 50;

/** Deterministic candidate for this process and slot (slot 0 matches the legacy pattern). */
export function candidatePort(slot = 1, pid = process.pid) {
  const base = Number(process.env.NERVIX_TEST_PORT_BASE ?? BASE);
  return base + slot * SLOT_STRIDE + (pid % SPREAD);
}

function isFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/** First free, non-reserved port at or after the slot's candidate. */
export async function pickTestPort(slot = 1) {
  const start = candidatePort(slot);
  for (let port = start; port < start + MAX_PROBES; port++) {
    if (RESERVED_PORTS.includes(port)) continue;
    if (await isFree(port)) return port;
  }
  throw new Error(`no free test port near ${start}`);
}
