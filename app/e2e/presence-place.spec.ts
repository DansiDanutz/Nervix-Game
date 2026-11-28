import { test, expect, type Page } from "@playwright/test";
import { layout, placeOf, signInAs, walkIntoDangg, walkTo, player } from "./helpers/sliceWalk";

/**
 * C3 place-scoped presence, two browser contexts on fixture sessions.
 * A walks into DanGG's house; B stays on the plaza and loses A. Neither page
 * ever shows its own handle (no self ghost), including before the session
 * resolves. Reads the DEV-only `window.__nervixPresence` hook from
 * src/net/presence.ts: { self, place, players: handles shown }.
 */
type PresenceDebug = { self: string | null; place: string; players: string[] };

const presence = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixPresence?: PresenceDebug }).__nervixPresence ?? null);

const selfOf = async (page: Page) => (await presence(page))?.self ?? null;

async function shows(page: Page, other: Page) {
  const [mine, theirs] = await Promise.all([presence(page), selfOf(other)]);
  return Boolean(mine && theirs && mine.players.includes(theirs));
}

/** Samples a page's presence for a while: its own handle must never be in its list. */
async function expectNoSelfGhost(page: Page, ms = 1500) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const p = await presence(page);
    if (p?.self) expect(p.players).not.toContain(p.self);
    else expect(p?.players ?? []).toEqual([]);
    await page.waitForTimeout(100);
  }
}

/** A short step so the server broadcasts this player's position. */
async function nudge(page: Page) {
  const p = (await player(page))!;
  await walkTo(page, p.x - 1.2, p.z, 0.6);
}

test("a player in DanGG's house leaves plaza presence and comes back on exit", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await Promise.all([signInAs(a, "sess_fixture_visitor"), signInAs(b, "sess_fixture_test")]);
    await Promise.all([expectNoSelfGhost(a), expectNoSelfGhost(b)]);

    await nudge(a);
    await expect.poll(() => shows(b, a), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await presence(a))?.place).toBe("plaza");

    await walkIntoDangg(a, await layout(a));
    await expect.poll(async () => (await presence(a))?.place, { timeout: 10_000 }).toBe("prop_dangg");
    await expect.poll(() => shows(b, a), { timeout: 10_000 }).toBe(false);
    await nudge(b);
    await expect.poll(() => shows(a, b), { timeout: 5_000 }).toBe(false);
    await b.waitForTimeout(1000);
    expect(await shows(b, a), "A's house moves never reach the plaza").toBe(false);
    await expectNoSelfGhost(a);

    await a.keyboard.press("Escape");
    await expect.poll(() => placeOf(a)).toBe("plaza");
    await expect.poll(() => shows(b, a), { timeout: 15_000 }).toBe(true);
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});

test("no self ghost while the session is still resolving", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    // Slow the session read so presence first connects as a guest, then reconnects as the member.
    await page.route("**/api/session**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.context().addCookies([{ name: "nervix_session", value: "sess_fixture_visitor", domain: "127.0.0.1", path: "/" }]);
    await page.goto("/");
    await page.locator("canvas").waitFor();
    await expectNoSelfGhost(page, 4000);
  } finally {
    await ctx.close();
  }
});

/**
 * C3 repair: a house outside the contract (a prop_demo_* directory house).
 * Without the store hookup the server refuses it; with it the server accepts
 * it. Either way the plaza must lose the player: no frozen ghost stays behind.
 * A drives a raw presence socket from its page (same origin, Vite proxy).
 */
test("a move into a prop_demo_ house the server may refuse never leaves a plaza ghost", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await signInAs(b, "sess_fixture_test");
    await a.goto("/");
    const handle = await a.evaluate(() => new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence`);
      (window as unknown as { __rawPresence?: WebSocket }).__rawPresence = ws;
      ws.onerror = () => reject(new Error("raw presence socket failed"));
      ws.onmessage = (event) => {
        const frame = JSON.parse(event.data as string) as { type: string; id?: string };
        if (frame.type !== "welcome" || !frame.id) return;
        ws.send(JSON.stringify({ type: "move", x: 5, z: 5, seq: 1, place: "plaza" }));
        resolve(frame.id);
      };
      ws.onopen = () => ws.send(JSON.stringify({ type: "join", district: "central-plaza", place: "plaza" }));
    }));
    const bShows = async () => ((await presence(b))?.players ?? []).includes(handle);
    await expect.poll(bShows, { timeout: 15_000 }).toBe(true);

    await a.evaluate(() => (window as unknown as { __rawPresence: WebSocket }).__rawPresence
      .send(JSON.stringify({ type: "place", place: "prop_demo_lantern" })));
    await expect.poll(bShows, { timeout: 10_000 }).toBe(false);
    await b.waitForTimeout(1000);
    expect(await bShows(), "the plaza never shows A again while A is away").toBe(false);
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});
