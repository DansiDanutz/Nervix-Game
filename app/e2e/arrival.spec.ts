import { test, expect, type Page } from "@playwright/test";

const EVIDENCE = "../docs/evidence/slice";

type Player = { x: number; z: number; yaw: number; cx: number; cy: number; cz: number; lookY: number };
const player = (page: Page) => page.evaluate(() => (window as unknown as { __nervixPlayer?: Player }).__nervixPlayer ?? null);

type NdcBox = { minX: number; maxX: number; minY: number; maxY: number };
type Arrival = {
  loaded: boolean;
  fountainScreen: { x: number; y: number };
  avatarScreen: NdcBox | null;
  cafeScreen: { x: number; y: number } | null;
  sightline: string | null;
  alerts: string[];
};
const arrivalProbe = (page: Page) => page.evaluate(() => (window as unknown as { __nervixArrival?: Arrival }).__nervixArrival ?? null);

/** The arrival is only claimable with the Blender export: runtime_layout.plaza in the slice manifest. */
async function requirePlazaExport(page: Page) {
  const plaza = await page.evaluate(async () => {
    const res = await fetch("/slice/manifest.json");
    if (!res.ok) return null;
    const m = await res.json().catch(() => null);
    return (m?.runtime_layout?.plaza ?? null) as { glb?: string } | null;
  });
  if (!plaza?.glb) {
    throw new Error(
      "No runtime_layout.plaza in app/public/slice/manifest.json: the Blender arrival square (nervix_arrival_square.glb) " +
        "is not exported, so the A01 arrival cannot be claimed. Run the Blender arrival export first.",
    );
  }
  return plaza;
}

/** Fresh player through the normal gate: sign up, verify the demo code, enter. */
async function enterAsFreshPlayer(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account|sign up|new here/i }).first().click().catch(() => {});
  const email = `arrival_${Date.now()}@fixture.nervix.invalid`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const code = (await page.locator(".gate__hint strong").textContent())?.trim() ?? "";
  await page.getByPlaceholder("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

type Rect = { x: number; y: number; width: number; height: number };
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Boxes of every visible element matching `selector` (opacity and visibility respected). */
const visibleBoxes = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    return Array.from(document.querySelectorAll<HTMLElement>(sel))
      .filter((el) => {
        const cs = getComputedStyle(el);
        return el.offsetParent !== null && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.className || el.tagName, x: r.x, y: r.y, width: r.width, height: r.height };
      })
      .filter((r) => r.width > 0 && r.height > 0);
  }, selector);

/** Settled = canvas drawn, assets idle, and the camera has stopped moving. */
async function waitSettled(page: Page) {
  await page.locator("canvas").waitFor();
  await page.waitForLoadState("networkidle");
  await expect.poll(() => player(page), { timeout: 30_000 }).not.toBeNull();
  let prev = await player(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const cur = await player(page);
    if (prev && cur && Math.abs(cur.cx - prev.cx) + Math.abs(cur.cy - prev.cy) + Math.abs(cur.cz - prev.cz) < 0.001) return cur;
    prev = cur;
  }
  throw new Error("camera never settled");
}

test("first view is pedestrian eye level on the street, facing Fountain Square", async ({ page }) => {
  await enterAsFreshPlayer(page);
  // Fail before any evidence is written when the Blender export is missing.
  await requirePlazaExport(page);
  await expect
    .poll(async () => (await arrivalProbe(page))?.loaded ?? false, { timeout: 60_000, message: "arrival GLB never appeared in the scene" })
    .toBe(true);
  const first = await waitSettled(page);
  await page.waitForTimeout(600); // let the 4 Hz probe sample the settled frame

  // No warning (e.g. "no runtime_layout") may sit in the evidence frame.
  await expect(page.locator("[role=alert]:visible")).toHaveCount(0);
  const probe = (await arrivalProbe(page))!;
  expect(probe.alerts).toEqual([]);
  // Unobstructed view of the fountain from the spawn.
  expect(probe.sightline ?? "", `first mesh on the camera→fountain ray: ${probe.sightline}`).toMatch(/^fountain/i);
  // Fountain near the horizontal centre, at a sensible height.
  expect(Math.abs(probe.fountainScreen.x)).toBeLessThan(0.25);
  expect(probe.fountainScreen.y).toBeGreaterThan(-0.6);
  expect(probe.fountainScreen.y).toBeLessThan(0.5);
  // The avatar never covers the fountain.
  const a = probe.avatarScreen;
  expect(a, "local avatar not found in the scene").not.toBeNull();
  const pad = 0.05;
  const f = probe.fountainScreen;
  const covered = f.x > a!.minX - pad && f.x < a!.maxX + pad && f.y > a!.minY - pad && f.y < a!.maxY + pad;
  expect(covered, `avatar ${JSON.stringify(a)} covers the fountain at ${JSON.stringify(f)}`).toBe(false);

  // The A01 left anchor reads: the cafe awning is in frame and the avatar does not cover it.
  const cafe = probe.cafeScreen;
  expect(cafe, "cafe_awning not found in the arrival GLB").not.toBeNull();
  expect(Math.abs(cafe!.x)).toBeLessThan(1);
  expect(Math.abs(cafe!.y)).toBeLessThan(1);
  expect(cafe!.x, "cafe must sit on the left of the frame").toBeLessThan(0);
  const cafeCovered = cafe!.x > a!.minX && cafe!.x < a!.maxX && cafe!.y > a!.minY && cafe!.y < a!.maxY;
  expect(cafeCovered, `avatar ${JSON.stringify(a)} covers the cafe at ${JSON.stringify(cafe)}`).toBe(false);

  // HUD: the bottom hints never overlap each other.
  const hints = await visibleBoxes(page, ".hint-stack > *, .hud__help, .place-hint, .controls-hint");
  expect(hints.length).toBeGreaterThan(0);
  for (let i = 0; i < hints.length; i++) {
    for (let j = i + 1; j < hints.length; j++) {
      expect(intersects(hints[i], hints[j]), `hint ${hints[i].name} overlaps ${hints[j].name}`).toBe(false);
    }
  }
  // HUD: the quest is a compact chip docked under the title, not a card over the street.
  const viewport = page.viewportSize()!;
  await expect(page.getByTestId("quest")).toHaveAttribute("data-open", "false");
  const quest = (await page.getByTestId("quest").boundingBox())!;
  expect(quest.height).toBeLessThan(48);
  expect(quest.y + quest.height).toBeLessThan(viewport.height * 0.2);
  // HUD: no debug diagnostics (FPS, presence) without ?debug=1, and the side tools are collapsed.
  await expect(page.getByTestId("debug-status")).toHaveCount(0);
  await expect(page.locator(".app__side")).not.toContainText(/fps/i);
  await expect(page.getByTestId("side-menu")).toHaveAttribute("aria-expanded", "false");
  // World labels fade in near their doors; none sits on the hero facades in the arrival shot.
  expect(await visibleBoxes(page, ".door-label")).toEqual([]);
  // No DOM panel covers the cafe awning.
  const cafePx = { x: ((cafe!.x + 1) / 2) * viewport.width, y: ((1 - cafe!.y) / 2) * viewport.height, width: 1, height: 1 };
  const panels = await visibleBoxes(page, ".hud__quest, .hud__seals, .app__side > *, .hint-stack > *");
  for (const p of panels) expect(intersects(p, cafePx), `${p.name} covers the cafe awning`).toBe(false);

  await page.screenshot({ path: `${EVIDENCE}/game-arrival-first-frame.png` });

  // On the east street, outside the 26 m square (|x| > 13), not in a house.
  expect(first.x).toBeGreaterThan(13);
  expect(Math.abs(first.z)).toBeLessThan(3);
  expect(await page.getByTestId("place-hint").getAttribute("data-place")).toBe("plaza");
  // Pedestrian eye level, not overhead.
  expect(first.cy).toBeGreaterThan(1.4);
  expect(first.cy).toBeLessThan(2.1);
  // Level gaze: not at the sky, not straight down.
  expect(first.lookY).toBeLessThan(0.05);
  expect(first.lookY).toBeGreaterThan(-0.25);
  // Facing the fountain at the origin (camera behind, looking toward -x).
  expect(first.cx).toBeGreaterThan(first.x);
});
