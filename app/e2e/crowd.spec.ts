import { test, expect, type Browser, type Page } from "@playwright/test";
import { signInAs } from "./helpers/sliceWalk";

/**
 * C6 crowd rendering on the GPU: 100 presence bots on the plaza, seen by one signed-in player.
 * Records FPS and draw calls for desktop and mobile emulation (attached to the report and printed),
 * checks the LOD caps from world/remoteCrowd.ts, and saves a labelled-crowd screenshot.
 *
 * Needs world3d/RemoteCrowd.tsx mounted in SceneView (it publishes the DEV hook
 * `window.__nervixCrowd`). Bots are plain same-origin WebSockets from a second, cookie-less
 * context, so they pass the presence Origin allow-list as guests (C4 bots, no fixture ids).
 */
type CrowdDebug = { total: number; full: number; impostor: number; labels: number; shadows: number; calls: number; triangles: number };

const BOTS = 100;
const BOT_HZ = 5;
const FPS_SAMPLE_MS = 3000;
const CAPS = { full: 30, labels: 12, shadows: 8 };

const crowd = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixCrowd?: CrowdDebug }).__nervixCrowd ?? null);

/** Opens the bots in a cookie-less same-origin page; they walk small circles spread over the square. */
async function startBots(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/slice/manifest.json");
  await page.evaluate(
    ({ count, hz }) => {
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence`;
      const sockets: WebSocket[] = [];
      for (let i = 0; i < count; i += 1) {
        const ring = 3 + (i % 10) * 3.5; // 3 m to ~35 m from the square's centre
        const phase = (i * 2.399) % (Math.PI * 2);
        const cx = 8 + ring * Math.cos(phase);
        const cz = ring * Math.sin(phase) * 0.8;
        const ws = new WebSocket(url);
        let seq = 0;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "join", district: "central-plaza", place: "plaza" }));
          setInterval(() => {
            seq += 1;
            const a = phase + seq * 0.05;
            const x = Math.round((cx + 1.5 * Math.cos(a)) * 100) / 100;
            const z = Math.round((cz + 1.5 * Math.sin(a)) * 100) / 100;
            // Look yaw along the circle's tangent (-sin a, cos a) under forward = (-sin yaw, -cos yaw): yaw = π - a.
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "move", x, z, yaw: Math.PI - a, seq, place: "plaza" }));
          }, 1000 / hz);
        };
        sockets.push(ws);
      }
      (window as unknown as { __bots?: WebSocket[] }).__bots = sockets;
    },
    { count: BOTS, hz: BOT_HZ },
  );
  return ctx;
}

/** Frames per second over a window, timed in the page with requestAnimationFrame. */
const measureFps = (page: Page) =>
  page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = (t: number) => {
          frames += 1;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (t - t0));
        };
        requestAnimationFrame(tick);
      }),
    FPS_SAMPLE_MS,
  );

async function runCrowd(browser: Browser, page: Page, label: string) {
  const bots = await startBots(browser);
  try {
    await signInAs(page, "sess_fixture_visitor");
    await expect
      .poll(async () => (await crowd(page))?.total ?? -1, { timeout: 30_000, message: "RemoteCrowd mounted and showing the bots" })
      .toBeGreaterThanOrEqual(BOTS);
    const fps = await measureFps(page);
    const stats = (await crowd(page))!;
    expect(stats.full).toBeLessThanOrEqual(CAPS.full);
    expect(stats.labels).toBeLessThanOrEqual(CAPS.labels);
    expect(stats.shadows).toBeLessThanOrEqual(CAPS.shadows);
    expect(stats.full + stats.impostor).toBe(stats.total);
    expect(stats.labels, "near players are labelled").toBeGreaterThan(0);
    const record = { label, bots: BOTS, fps: Math.round(fps * 10) / 10, ...stats };
    console.log(`[crowd] ${JSON.stringify(record)}`);
    await test.info().attach(`crowd-${label}.json`, { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    await page.screenshot({ path: `../docs/evidence/slice/crowd-labelled-${label}.png` });
  } finally {
    await bots.close();
  }
}

test.describe("crowd: desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("100 bots stay inside the LOD caps; FPS and draw calls recorded", async ({ browser, page }) => {
    test.setTimeout(180_000);
    await runCrowd(browser, page, "desktop");
  });
});

test.describe("crowd: mobile emulation", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test("100 bots on a phone-sized view; FPS and draw calls recorded", async ({ browser, page }) => {
    test.setTimeout(180_000);
    await runCrowd(browser, page, "mobile");
  });
});
