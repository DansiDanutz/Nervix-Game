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

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
type Pt = { x: number; z: number };
type Door = Pt & { yaw: number };
type Plaza = {
  spawn: Door;
  fountain: { x: number; z: number; radius: number; top_y: number };
  bounds: Box;
  obstacles: Box[];
  test_builder_door: Door;
};
type Layout = {
  facade_door: Pt & { yaw?: number };
  salon: { spawn: Pt; exit: Pt; dangg_door: Pt };
  plaza?: Plaza;
};

async function layout(page: Page) {
  return page.evaluate(async () => {
    const m = await (await fetch("/slice/manifest.json")).json();
    return m.runtime_layout;
  }) as Promise<Layout>;
}

/* Route planning around plaza obstacles (fountain basin, buildings, planters). */
const PAD = 0.35 + 0.2; // player radius + margin
const CLEAR = 1.1; // how far outside an obstacle corner a detour waypoint sits

const inside = (p: Pt, b: Box, pad: number) => p.x > b.minX - pad && p.x < b.maxX + pad && p.z > b.minZ - pad && p.z < b.maxZ + pad;

/** Does segment a→b cross box b (inflated by pad)? Slab test. */
function crosses(a: Pt, b: Pt, box: Box, pad: number) {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, z: b.z - a.z };
  for (const [p, dp, lo, hi] of [[a.x, d.x, box.minX - pad, box.maxX + pad], [a.z, d.z, box.minZ - pad, box.maxZ + pad]] as const) {
    if (Math.abs(dp) < 1e-9) {
      if (p <= lo || p >= hi) return false;
      continue;
    }
    const ta = (lo - p) / dp;
    const tb = (hi - p) / dp;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 >= t1) return false;
  }
  return true;
}

/** Waypoints from → to that detour around the corners of any obstacle in the way. */
function planRoute(from: Pt, to: Pt, obstacles: Box[], depth = 0): Pt[] {
  const hit = obstacles.find((o) => crosses(from, to, o, PAD));
  if (!hit || depth > 3) return [to];
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
  const corners: Pt[] = [
    { x: hit.minX - CLEAR, z: hit.minZ - CLEAR }, { x: hit.maxX + CLEAR, z: hit.minZ - CLEAR },
    { x: hit.minX - CLEAR, z: hit.maxZ + CLEAR }, { x: hit.maxX + CLEAR, z: hit.maxZ + CLEAR },
  ]
    .filter((c) => !obstacles.some((o) => inside(c, o, PAD)))
    .filter((c) => !crosses(from, c, hit, PAD) && !crosses(c, to, hit, PAD))
    .sort((a, b) => dist(from, a) + dist(a, to) - (dist(from, b) + dist(b, to)));
  if (corners.length === 0) return [to];
  const via = corners[0];
  return [...planRoute(from, via, obstacles, depth + 1), ...planRoute(via, to, obstacles, depth + 1)];
}

/** Walk to (tx, tz) via detour waypoints around the plaza obstacles. */
async function walkRoute(page: Page, tx: number, tz: number, reach: number, obstacles: Box[]) {
  const p = (await player(page))!;
  const route = planRoute({ x: p.x, z: p.z }, { x: tx, z: tz }, obstacles);
  for (const wp of route.slice(0, -1)) await walkTo(page, wp.x, wp.z, 0.9);
  return walkTo(page, tx, tz, reach);
}

const plazaObstacles = (L: Layout) => L.plaza?.obstacles ?? [];

/** A reachable point at the fountain's edge, on the street side, outside every obstacle. */
function fountainEdge(L: Layout): Pt {
  const plaza = L.plaza;
  if (!plaza) return { x: 4.5, z: 0.5 }; // legacy blockout basin
  const f = plaza.fountain;
  const basin = plaza.obstacles.find((o) => inside(f, o, 0)) ?? { minX: f.x - f.radius, maxX: f.x + f.radius, minZ: f.z - f.radius, maxZ: f.z + f.radius };
  for (const dz of [0, 1.5, -1.5, 3, -3]) {
    const c = { x: basin.maxX + PAD + 0.9, z: f.z + dz };
    if (!plaza.obstacles.some((o) => inside(c, o, PAD))) return c;
  }
  throw new Error(`no reachable fountain edge east of the basin ${JSON.stringify(basin)}`);
}

/** Plaza-side approach to the Test Builder door: the manifest threshold, stepped back along its yaw. */
function testBuilderApproach(L: Layout): Pt & { threshold: Pt } {
  const d = L.plaza?.test_builder_door;
  if (!d) return { x: 6, z: 6.2, threshold: { x: 6, z: 4 } }; // legacy free-standing door
  return { x: d.x + Math.sin(d.yaw) * 1.2, z: d.z + Math.cos(d.yaw) * 1.2, threshold: d };
}

/** Street → OpenPoker doors → salon → DanGG's house, by keyboard and mouse only. */
async function walkIntoDangg(page: Page, L: Layout, shots = false) {
  const fx = L.facade_door.x + Math.sin(L.facade_door.yaw ?? 0) * 2;
  const fz = L.facade_door.z + Math.cos(L.facade_door.yaw ?? 0) * 2;
  await walkRoute(page, fx, fz, 1.0, plazaObstacles(L));
  if (shots) await page.screenshot({ path: `${EVIDENCE}/game-route-2-openpoker-door.png` });
  await expect(page.getByTestId("place-hint")).toContainText("Enter OpenPoker");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("venue");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: `${EVIDENCE}/game-salon-threshold.png` });
  // No plaza prompt may leak into the salon.
  await expect(page.locator(".hud__prompt")).toHaveCount(0);

  await walkTo(page, L.salon.dangg_door.x, L.salon.dangg_door.z, 1.4);
  await expect(page.getByTestId("place-hint")).toContainText("Enter DanGG");
  await page.keyboard.press("Enter");
  await expect.poll(() => placeOf(page)).toBe("house:bld_dangg");
  await expect(page.getByTestId("house-name")).toHaveText("DanGG");
}

test("street → Fountain Square → OpenPoker → DanGG → plaza with keyboard and mouse", async ({ page }) => {
  test.setTimeout(150_000);
  await signInAs(page, "sess_fixture_visitor");
  const start = (await player(page))!;
  expect(start.x).toBeGreaterThan(13); // on the street
  const L = await layout(page);

  const edge = fountainEdge(L);
  await walkRoute(page, edge.x, edge.z, 1.2, plazaObstacles(L));
  await page.screenshot({ path: `${EVIDENCE}/game-route-1-fountain.png` });

  await walkIntoDangg(page, L, true);
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
  test.setTimeout(120_000);
  await signInAs(page, "sess_fixture_visitor");
  const L = await layout(page);
  const tb = testBuilderApproach(L);
  await walkRoute(page, tb.x, tb.z, 1.0, plazaObstacles(L));
  await expect(page.getByTestId("place-hint")).toContainText("Enter Test Builder");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("house:slot-12");
  await expect(page.getByTestId("house-name")).toHaveText("Test Builder");

  // Leaving puts the player back on the plaza in front of the Test Builder door.
  await page.keyboard.press("Escape");
  await expect.poll(() => placeOf(page)).toBe("plaza");
  await expect
    .poll(async () => {
      const back = (await player(page))!;
      return Math.hypot(back.x - tb.threshold.x, back.z - tb.threshold.z);
    }, { timeout: 10_000 })
    .toBeLessThan(4);
});

test("owner edits their own house in the UI; the edit is visible to visitors", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const welcome = `Welcome to DanGG — fixture edit ${Date.now()}`;
  await signInAs(page, "sess_fixture_dangg");
  const L = await layout(page);
  await walkIntoDangg(page, L);
  // Owner: the editor is there; edit through the form, not the API.
  await expect(page.getByTestId("house-editor")).toBeVisible();
  await page.getByTestId("edit-welcome").fill(welcome);
  await page.getByTestId("edit-save").click();
  await expect(page.getByTestId("edit-status")).toHaveText("Saved");
  await expect(page.getByTestId("house-welcome")).toHaveText(welcome);
  await page.screenshot({ path: `${EVIDENCE}/game-owner-edit.png` });

  const visitor = await browser.newContext();
  try {
    const vp = await visitor.newPage();
    await signInAs(vp, "sess_fixture_visitor");
    const seen = await vp.evaluate(async () => (await fetch("/api/houses/prop_dangg")).json());
    expect(seen.house.profile.welcome).toBe(welcome);
    expect(seen.canEdit).toBe(false);
    // And in the visitor's own view of the house, read-only.
    await walkIntoDangg(vp, L);
    await expect(vp.getByTestId("house-welcome")).toHaveText(welcome);
    await expect(vp.getByTestId("house-editor")).toHaveCount(0);
  } finally {
    await visitor.close();
  }
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
