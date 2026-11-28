import { expect, type Locator, type Page } from "@playwright/test";
import { player, type Box, type Layout, type Pt } from "./walk";

/**
 * Touch-only walking for app/e2e/touch.spec.ts: hold the on-screen pad buttons
 * with touch pointer events, turn with the pad's turn buttons. The route
 * planner mirrors helpers/walk.ts (which keeps it private); the lead may make
 * walk.ts import planRoute from here.
 */
const TURN_RATE = 1.8; // KEY_TURN_RATE, rad/s
const TURN_TOLERANCE = 0.08;
const PAD = 0.35 + 0.2;
const CLEAR = 1.1;

let nextPointerId = 100;

export const padButton = (page: Page, label: string) => page.getByTestId("touch-controls").getByRole("button", { name: label, exact: true });

const touchInit = (pointerId: number) => ({ pointerId, pointerType: "touch", isPrimary: true, bubbles: true });

/** Press a pad button with a touch pointer; returns the release, which ends with `end` (pointerup or pointercancel). */
export async function pressPad(button: Locator) {
  const pointerId = nextPointerId++;
  await button.dispatchEvent("pointerdown", { ...touchInit(pointerId), buttons: 1 });
  return (end: "pointerup" | "pointercancel" = "pointerup") => button.dispatchEvent(end, { ...touchInit(pointerId), buttons: 0 });
}

export async function holdPad(page: Page, label: string, ms: number) {
  const release = await pressPad(padButton(page, label));
  await page.waitForTimeout(ms);
  await release();
}

/** Turn to `want` with the pad's turn buttons (left raises yaw). */
export async function turnTo(page: Page, want: number) {
  for (let i = 0; i < 4; i++) {
    const p = (await player(page))!;
    const diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
    if (Math.abs(diff) < TURN_TOLERANCE) return;
    await holdPad(page, diff > 0 ? "Turn left" : "Turn right", (Math.abs(diff) / TURN_RATE) * 1000);
    await page.waitForTimeout(80);
  }
}

export async function touchWalkTo(page: Page, tx: number, tz: number, reach = 1.6) {
  for (let leg = 0; leg < 12; leg++) {
    const p = (await player(page))!;
    if (Math.hypot(tx - p.x, tz - p.z) < reach) return p;
    await turnTo(page, Math.atan2(-(tx - p.x), -(tz - p.z)));
    const release = await pressPad(padButton(page, "Forward"));
    let last = Math.hypot(tx - p.x, tz - p.z);
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(50);
      const q = (await player(page))!;
      const d = Math.hypot(tx - q.x, tz - q.z);
      if (d < reach * 0.7 || d > last + 0.05) break;
      last = d;
    }
    await release();
    await page.waitForTimeout(120);
  }
  const p = (await player(page))!;
  throw new Error(`touch walk could not reach (${tx}, ${tz}); stuck at (${p.x}, ${p.z})`);
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

export function planRoute(from: Pt, to: Pt, obstacles: Box[], depth = 0): Pt[] {
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

/** Walk to the OpenPoker facade by touch and tap the pad's Enter button. */
export async function touchIntoOpenPoker(page: Page, L: Layout) {
  const fx = L.facade_door.x + Math.sin(L.facade_door.yaw ?? 0) * 2;
  const fz = L.facade_door.z + Math.cos(L.facade_door.yaw ?? 0) * 2;
  const p = (await player(page))!;
  const route = planRoute({ x: p.x, z: p.z }, { x: fx, z: fz }, L.plaza?.obstacles ?? []);
  for (const wp of route.slice(0, -1)) await touchWalkTo(page, wp.x, wp.z, 0.9);
  await touchWalkTo(page, fx, fz, 1.0);
  await expect(page.getByTestId("place-hint")).toContainText("Enter OpenPoker");
  await padButton(page, "Enter").tap();
}
