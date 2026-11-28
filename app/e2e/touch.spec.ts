import { test, expect, devices, type Page } from "@playwright/test";
import { layout, placeOf, player, signInAs } from "./helpers/walk";
import { holdPad, padButton, pressPad, touchIntoOpenPoker, turnTo } from "./helpers/touchWalk";

/**
 * CT4 touch controls on a phone profile (hasTouch, isMobile). Touch only: no
 * keyboard or mouse calls after sign-in. Fixture sessions on the throwaway
 * E2E database. Depends on the lead's hookups (always-mounted pad in App.tsx,
 * withTouch in PlayerController, touch-action:none on the Canvas).
 */
test.use({ ...devices["Pixel 7"], viewport: { width: 412, height: 839 } });

const HOLD_MS = 700;
const where = async (page: Page) => (await player(page))!;
const moved = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);

/** Face the open street (+x, away from the square) so no wall clips a leg. */
const faceOpenStreet = (page: Page) => turnTo(page, Math.atan2(-1, 0));

test("the pad is mounted in the world with no door in reach", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  const pad = page.getByTestId("touch-controls");
  await expect(pad).toBeVisible();
  for (const name of ["Forward", "Back", "Left", "Right", "Turn left", "Turn right", "Run"]) await expect(padButton(page, name)).toBeVisible();
  await expect(padButton(page, "Enter")).toHaveCount(0);
});

test("holding the forward pad moves more than 1 m", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  const a = await where(page);
  await holdPad(page, "Forward", HOLD_MS);
  await page.waitForTimeout(150);
  expect(moved(a, await where(page))).toBeGreaterThan(1);
});

test("pointercancel stops movement", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  const release = await pressPad(padButton(page, "Forward"));
  await page.waitForTimeout(300);
  await release("pointercancel");
  await page.waitForTimeout(150);
  const stopped = await where(page);
  await page.waitForTimeout(500);
  expect(moved(stopped, await where(page))).toBeLessThan(0.05);
  await expect(padButton(page, "Forward")).not.toHaveAttribute("data-held", "true");
});

test("the run toggle covers 1.6-1.8 times the walking distance", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  const a = await where(page);
  await holdPad(page, "Forward", 600);
  await page.waitForTimeout(150);
  const b = await where(page);
  await holdPad(page, "Back", 600);
  await padButton(page, "Run").tap();
  await expect(padButton(page, "Run")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(150);
  const c = await where(page);
  await holdPad(page, "Forward", 600);
  await page.waitForTimeout(150);
  const ratio = moved(c, await where(page)) / moved(a, b);
  expect(ratio).toBeGreaterThanOrEqual(1.6);
  expect(ratio).toBeLessThanOrEqual(1.8);
});

test("holding a turn button for 1 s turns about +-1.8 rad", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  for (const [name, sign] of [["Turn left", 1], ["Turn right", -1]] as const) {
    const before = (await where(page)).yaw;
    await holdPad(page, name, 1000);
    expect(Math.abs((await where(page)).yaw - before - sign * 1.8)).toBeLessThan(0.3);
  }
});

test("a touch drag on the canvas changes yaw without scrolling the page", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  const box = (await page.locator("canvas").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  const before = await where(page);
  const cdp = await page.context().newCDPSession(page);
  const point = (px: number) => [{ x: px, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x) });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x + i * 10) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
  const turned = before.yaw - (await where(page)).yaw; // a right drag turns right
  expect(turned).toBeGreaterThan(0.25); // ~100 px past the 6 px threshold at 0.005 rad/px
  expect(await page.evaluate(() => [window.scrollX, window.scrollY, document.scrollingElement?.scrollTop ?? 0])).toEqual([0, 0, 0]);
});

test("the OpenPoker route can be finished by touch only", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  const L = await layout(page);
  await touchIntoOpenPoker(page, L);
  await expect.poll(() => placeOf(page)).toBe("venue");
  await expect(padButton(page, "Exit")).toBeVisible();
});

test("holding Forward while dragging the canvas turns smoothly and the pad lift keeps the drag", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 3;
  const forward = padButton(page, "Forward");
  const padBox = (await forward.boundingBox())!;
  const before = await where(page);
  const release = await pressPad(forward);
  const look = { pointerId: 900, pointerType: "touch", isPrimary: false, bubbles: true };
  // A second touch pointer sliding over the pad (pressPad's ids start at 100; 99 is free).
  const padMove = (i: number) => forward.dispatchEvent("pointermove", { pointerId: 99, pointerType: "touch", bubbles: true, buttons: 1, clientX: padBox.x + i, clientY: padBox.y + i });
  await canvas.dispatchEvent("pointerdown", { ...look, buttons: 1, clientX: x, clientY: y });
  for (let i = 1; i <= 5; i++) {
    await padMove(i);
    await canvas.dispatchEvent("pointermove", { ...look, buttons: 1, clientX: x + i * 10, clientY: y });
  }
  // Hold Forward for a fixed time: the dispatches above take only tens of ms on the GPU runner.
  await page.waitForTimeout(400);
  await release();
  for (let i = 6; i <= 10; i++) await canvas.dispatchEvent("pointermove", { ...look, buttons: 1, clientX: x + i * 10, clientY: y });
  await canvas.dispatchEvent("pointerup", { ...look, buttons: 0, clientX: x + 100, clientY: y });
  await page.waitForTimeout(150);
  const after = await where(page);
  const turned = before.yaw - after.yaw; // a right drag turns right
  expect(turned).toBeGreaterThan(0.25); // the drag survived the pad lift
  expect(turned).toBeLessThan(0.8); // no jump from the pad finger's position
  expect(moved(before, after)).toBeGreaterThan(0.2); // Forward moved the player meanwhile
});
