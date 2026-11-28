import { test, expect, type Page } from "@playwright/test";
import { signInAs, walkTo, player } from "./helpers/sliceWalk";

/**
 * C4 presence transport in the browser: the client rebuilds its room from
 * `welcome` plus 10 Hz `delta` frames. With two fixture contexts, B appears
 * for A, A's view stays correct while B walks (deltas applied, never a self
 * ghost), and B's tab closing reaches A as a `left` entry. Reads the DEV-only
 * `window.__nervixPresence` hook ({ self, place, players }).
 */
type PresenceDebug = { self: string | null; place: string; players: string[] };

const presence = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixPresence?: PresenceDebug }).__nervixPresence ?? null);

async function shows(page: Page, other: Page) {
  const [mine, theirs] = await Promise.all([presence(page), presence(other)]);
  return Boolean(mine && theirs?.self && mine.players.includes(theirs.self));
}

/** Counts presence frames by type on the page's own WebSocket. */
function countFrames(page: Page) {
  const counts = new Map<string, number>();
  page.on("websocket", (ws) => {
    if (!ws.url().endsWith("/presence")) return;
    ws.on("framereceived", ({ payload }) => {
      try {
        const type = (JSON.parse(String(payload)) as { type?: string }).type ?? "?";
        counts.set(type, (counts.get(type) ?? 0) + 1);
      } catch {
        /* not JSON */
      }
    });
  });
  return counts;
}

test("deltas keep a two-player room in sync and a closed tab leaves it", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const framesA = countFrames(a);
  try {
    await Promise.all([signInAs(a, "sess_fixture_visitor"), signInAs(b, "sess_fixture_test")]);
    await expect.poll(() => shows(a, b), { timeout: 15_000 }).toBe(true);

    const start = (await player(b))!;
    const before = framesA.get("delta") ?? 0;
    const t0 = Date.now();
    await walkTo(b, start.x - 3, start.z, 0.6);
    const elapsed = (Date.now() - t0) / 1000;
    const sent = (framesA.get("delta") ?? 0) - before;
    expect(sent, "B's walk reached A as deltas").toBeGreaterThan(0);
    expect(sent / elapsed, "deltas arrive at no more than the 10 Hz tick (plus slack)").toBeLessThanOrEqual(12);
    expect(framesA.get("players") ?? 0, "no full snapshot per move").toBe(0);

    const mine = (await presence(a))!;
    expect(mine.players).not.toContain(mine.self);
    expect(await shows(a, b)).toBe(true);

    const bSelf = (await presence(b))!.self;
    await ctxB.close();
    // B's own entry leaves A's room (other specs' players may share the plaza).
    await expect.poll(async () => (await presence(a))?.players.includes(bSelf!) ?? true, { timeout: 10_000 }).toBe(false);
  } finally {
    await ctxA.close();
    await ctxB.close().catch(() => {});
  }
});
