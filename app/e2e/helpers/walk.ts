import { expect, type Page } from "@playwright/test";

/**
 * Keyboard-and-mouse walking for specs other than route.spec.ts (which keeps
 * its own copy; the lead may switch it to these helpers). Fixture sessions only.
 */
export type Player = { x: number; z: number; yaw: number; cx: number; cy: number; cz: number; lookY: number };
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Pt = { x: number; z: number };
export type Door = Pt & { yaw: number };
export type Layout = {
  facade_door: Pt & { yaw?: number };
  salon: { spawn: Pt; exit: Pt; dangg_door: Pt };
  plaza?: { spawn: Door; bounds: Box; obstacles: Box[]; test_builder_door: Door };
};

/** Mouse sensitivity in PlayerController (rad per px). */
const LOOK_SENSITIVITY = 0.005;
const PAD = 0.35 + 0.2;
const CLEAR = 1.1;

export const player = (page: Page) => page.evaluate(() => (window as unknown as { __nervixPlayer?: Player }).__nervixPlayer ?? null);
export const placeOf = (page: Page) => page.getByTestId("place-hint").getAttribute("data-place");

export async function signInAs(page: Page, session: string) {
  await page.context().addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await page.locator("canvas").waitFor();
  await expect.poll(() => player(page), { timeout: 30_000 }).not.toBeNull();
}

export async function layout(page: Page) {
  return page.evaluate(async () => (await (await fetch("/slice/manifest.json")).json()).runtime_layout) as Promise<Layout>;
}

/** Drag on the canvas by dx px (right drag turns right: yaw decreases). */
export async function dragLook(page: Page, dx: number, dy = 0) {
  const box = (await page.locator("canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps, { steps: 2 });
  await page.mouse.up();
}

export async function walkTo(page: Page, tx: number, tz: number, reach = 1.6) {
  for (let leg = 0; leg < 12; leg++) {
    const p = (await player(page))!;
    if (Math.hypot(tx - p.x, tz - p.z) < reach) return p;
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    const diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
    if (Math.abs(diff) > 0.05) await dragLook(page, -diff / LOOK_SENSITIVITY);
    await page.keyboard.down("w");
    let last = Math.hypot(tx - p.x, tz - p.z);
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(50);
      const q = (await player(page))!;
      const d = Math.hypot(tx - q.x, tz - q.z);
      if (d < reach * 0.7 || d > last + 0.05) break;
      last = d;
    }
    await page.keyboard.up("w");
    await page.waitForTimeout(120);
  }
  const p = (await player(page))!;
  throw new Error(`could not reach (${tx}, ${tz}); stuck at (${p.x}, ${p.z})`);
}

const inside = (p: Pt, b: Box, pad: number) => p.x > b.minX - pad && p.x < b.maxX + pad && p.z > b.minZ - pad && p.z < b.maxZ + pad;

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
  return [...planRoute(from, corners[0], obstacles, depth + 1), ...planRoute(corners[0], to, obstacles, depth + 1)];
}

export async function walkRoute(page: Page, tx: number, tz: number, reach: number, L: Layout) {
  const p = (await player(page))!;
  const obstacles = L.plaza?.obstacles ?? [];
  const route = planRoute({ x: p.x, z: p.z }, { x: tx, z: tz }, obstacles);
  for (const wp of route.slice(0, -1)) await walkTo(page, wp.x, wp.z, 0.9);
  return walkTo(page, tx, tz, reach);
}

/** Stand at the plaza side of the Test Builder door, with its prompt showing. */
export async function walkToTestBuilderDoor(page: Page, L: Layout) {
  const d = L.plaza?.test_builder_door;
  const at = d ? { x: d.x + Math.sin(d.yaw) * 1.2, z: d.z + Math.cos(d.yaw) * 1.2 } : { x: 6, z: 6.2 };
  await walkRoute(page, at.x, at.z, 1.0, L);
  await expect(page.getByTestId("place-hint")).toContainText("Enter Test Builder House");
}

export async function walkIntoOpenPoker(page: Page, L: Layout) {
  const fx = L.facade_door.x + Math.sin(L.facade_door.yaw ?? 0) * 2;
  const fz = L.facade_door.z + Math.cos(L.facade_door.yaw ?? 0) * 2;
  await walkRoute(page, fx, fz, 1.0, L);
  await expect(page.getByTestId("place-hint")).toContainText("Enter OpenPoker");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("venue");
}
