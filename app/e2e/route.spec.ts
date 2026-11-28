import { test, expect, type Page } from "@playwright/test";

/**
 * The first playable slice, driven only by keyboard and mouse:
 * street → Fountain Square → OpenPoker → DanGG → plaza, plus permissions.
 * Fixture sessions only (NODE_ENV=test server, throwaway database).
 */
const EVIDENCE = "../docs/evidence/slice";
type Player = { x: number; z: number; yaw: number; cx: number; cy: number; cz: number; lookY: number };

const player = (page: Page) => page.evaluate(() => (window as unknown as { __nervixPlayer?: Player }).__nervixPlayer ?? null);
const placeOf = (page: Page) => page.getByTestId("place-hint").getAttribute("data-place");

async function signInAs(page: Page, session: string) {
  await page.context().addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await page.locator("canvas").waitFor();
  await expect.poll(() => player(page), { timeout: 30_000 }).not.toBeNull();
}

/** Turn with the mouse (drag on the canvas) until facing the target, then hold W until near it. */
async function walkTo(page: Page, tx: number, tz: number, reach = 1.6) {
  const box = (await page.locator("canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let leg = 0; leg < 12; leg++) {
    const p = (await player(page))!;
    if (Math.hypot(tx - p.x, tz - p.z) < reach) return p;
    // Desired yaw: forward = (-sin yaw, -cos yaw) points at the target.
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    let diff = want - p.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > 0.05) {
      // Dragging right turns right (yaw decreases): dx = -diff / sensitivity (0.005).
      const dx = -diff / 0.005;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      const steps = 8;
      for (let i = 1; i <= steps; i++) await page.mouse.move(cx + (dx * i) / steps, cy, { steps: 2 });
      await page.mouse.up();
    }
    // Hold W and watch the position; release on arrival or when progress stops (blocked).
    await page.keyboard.down("w");
    let last = Math.hypot(tx - p.x, tz - p.z);
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(50);
      const q = (await player(page))!;
      const d = Math.hypot(tx - q.x, tz - q.z);
      if (d < reach * 0.7 || d > last + 0.05) break; // arrived, or overshooting: re-aim
      last = d;
    }
    await page.keyboard.up("w");
    await page.waitForTimeout(120);
  }
  const p = (await player(page))!;
  throw new Error(`could not reach (${tx}, ${tz}); stuck at (${p.x}, ${p.z})`);
}

async function layout(page: Page) {
  return page.evaluate(async () => {
    const m = await (await fetch("/slice/manifest.json")).json();
    return m.runtime_layout as {
      facade_door: { x: number; z: number; yaw?: number };
      salon: { spawn: { x: number; z: number }; exit: { x: number; z: number }; dangg_door: { x: number; z: number } };
    };
  });
}

test("street → Fountain Square → OpenPoker → DanGG → plaza with keyboard and mouse", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  const start = (await player(page))!;
  expect(start.x).toBeGreaterThan(13); // on the street
  const L = await layout(page);

  await walkTo(page, 4.5, 0.5, 1.2); // edge of the fountain basin
  await page.screenshot({ path: `${EVIDENCE}/game-route-1-fountain.png` });

  // Approach so the facade door is ahead, then step up to it.
  const fx = L.facade_door.x + Math.sin(L.facade_door.yaw ?? 0) * 2;
  const fz = L.facade_door.z + Math.cos(L.facade_door.yaw ?? 0) * 2;
  await walkTo(page, fx, fz, 1.0);
  await page.screenshot({ path: `${EVIDENCE}/game-route-2-openpoker-door.png` });
  await expect(page.getByTestId("place-hint")).toContainText("Enter OpenPoker");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("venue");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${EVIDENCE}/game-salon-threshold.png` });

  await walkTo(page, L.salon.dangg_door.x, L.salon.dangg_door.z, 1.4);
  await expect(page.getByTestId("place-hint")).toContainText("Enter DanGG");
  await page.keyboard.press("Enter");
  await expect.poll(() => placeOf(page)).toBe("house:bld_dangg");
  await expect(page.getByTestId("house-name")).toHaveText("DanGG");
  await expect(page.getByTestId("house-editor")).toHaveCount(0); // visitor: read-only
  await page.screenshot({ path: `${EVIDENCE}/game-route-3-dangg.png` });

  await page.keyboard.press("Escape");
  await expect.poll(() => placeOf(page)).toBe("plaza");
  // The new plaza scene publishes its player on its first frame; poll past the stale house value.
  await expect
    .poll(async () => {
      const back = (await player(page))!;
      return Math.hypot(back.x - L.facade_door.x, back.z - L.facade_door.z);
    }, { timeout: 10_000 })
    .toBeLessThan(4.5);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${EVIDENCE}/game-route-4-back-on-plaza.png` });
});

test("Test Builder house stays independent on the plaza", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await walkTo(page, 6, 6.2, 1.2);
  await expect(page.getByTestId("place-hint")).toContainText("Enter Test Builder House");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("house:bld_test");
  await expect(page.getByTestId("house-name")).toHaveText("Test Builder");
});

test("owner edits their own house; the edit is visible to visitors", async ({ page, browser }) => {
  await page.context().addCookies([{ name: "nervix_session", value: "sess_fixture_dangg", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  const r = await page.evaluate(async () => (await fetch("/api/houses/prop_dangg")).json());
  expect(r.canEdit).toBe(true);
  // Through the UI: enter DanGG via OpenPoker is covered above; here open the panel directly.
  const save = await page.evaluate(async () => {
    const res = await fetch("/api/houses/prop_dangg/profile", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ welcome: "Welcome to DanGG — fixture edit" }),
    });
    return res.status;
  });
  expect(save).toBe(200);
  const visitor = await browser.newContext();
  await visitor.addCookies([{ name: "nervix_session", value: "sess_fixture_visitor", domain: "127.0.0.1", path: "/" }]);
  const vp = await visitor.newPage();
  await vp.goto("/");
  const seen = await vp.evaluate(async () => (await fetch("/api/houses/prop_dangg")).json());
  expect(seen.house.profile.welcome).toBe("Welcome to DanGG — fixture edit");
  expect(seen.canEdit).toBe(false);
  await visitor.close();
});

test("cross-owner edit is denied from the browser", async ({ page }) => {
  await page.context().addCookies([{ name: "nervix_session", value: "sess_fixture_dangg", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const res = await fetch("/api/houses/prop_test/profile", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ welcome: "taken" }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(r.status).toBe(403);
  expect(r.body.error).toBe("cross_owner");
});
