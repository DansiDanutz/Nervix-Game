import { test, expect, type Page } from "@playwright/test";

const EVIDENCE = "../docs/evidence/slice";

type Player = { x: number; z: number; yaw: number; cx: number; cy: number; cz: number; lookY: number };
const player = (page: Page) => page.evaluate(() => (window as unknown as { __nervixPlayer?: Player }).__nervixPlayer ?? null);

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
  const first = await waitSettled(page);
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
