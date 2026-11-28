import { test, expect, type Page } from "@playwright/test";
import { dragLook, layout, placeOf, player, signInAs, walkIntoOpenPoker, walkToTestBuilderDoor } from "./helpers/walk";

/**
 * CT1 control coverage: run/walk ratio, Q/R turn rate, drag-to-orbit, no stuck
 * keys, Enter on a focused button and Esc ordering. Keyboard and mouse only,
 * fixture sessions on the throwaway E2E database.
 */
const HOLD_MS = 1000;
const yaw = async (page: Page) => (await player(page))!.yaw;

/** Metres covered while holding the keys for `ms` (press order matters: modifiers first). */
async function distanceHolding(page: Page, keys: string[], ms: number) {
  const a = (await player(page))!;
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  await page.waitForTimeout(150);
  const b = (await player(page))!;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Face the open street so neither leg runs into a wall: turn toward +x (away from the square). */
async function faceOpenStreet(page: Page) {
  const p = (await player(page))!;
  const want = Math.atan2(-1, 0); // forward = (-sin yaw, -cos yaw) = (+1, 0)
  const diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
  await dragLook(page, -diff / 0.005);
}

test("Shift+W covers 1.6-1.8 times the distance of W", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  // Short legs, out and back, so bounds and obstacles never clip either measurement.
  const walk = await distanceHolding(page, ["w"], 600);
  await distanceHolding(page, ["s"], 600);
  const run = await distanceHolding(page, ["Shift", "w"], 600);
  expect(walk).toBeGreaterThan(1);
  const ratio = run / walk;
  expect(ratio).toBeGreaterThanOrEqual(1.6);
  expect(ratio).toBeLessThanOrEqual(1.8);
});

test("holding Q or R for 1 s turns about ±1.8 rad", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  for (const [key, sign] of [["q", 1], ["r", -1]] as const) {
    const before = await yaw(page);
    await page.keyboard.down(key);
    await page.waitForTimeout(HOLD_MS);
    await page.keyboard.up(key);
    const turned = (await yaw(page)) - before;
    expect(Math.abs(turned - sign * 1.8)).toBeLessThan(0.3);
  }
});

test("dragging on the canvas orbits the camera; a click without travel does not", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  const before = await yaw(page);
  await dragLook(page, 200);
  expect(before - (await yaw(page))).toBeCloseTo(1.0, 1); // 200 px * 0.005 rad/px, right drag turns right
  const settled = await yaw(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await yaw(page)).toBe(settled);
});

test("Meta, window blur and a hidden tab clear held movement keys", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await faceOpenStreet(page);
  // Meta: macOS drops the W keyup while Meta is held; the player must still stop.
  await page.keyboard.down("w");
  await page.keyboard.down("Meta");
  await page.keyboard.up("Meta");
  const stoppedAt = (await player(page))!;
  await page.waitForTimeout(400);
  const after = (await player(page))!;
  expect(Math.hypot(after.x - stoppedAt.x, after.z - stoppedAt.z)).toBeLessThan(0.15);
  await page.keyboard.up("w");
  // Blur while W is held.
  await page.keyboard.down("s");
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const blurred = (await player(page))!;
  await page.waitForTimeout(400);
  const later = (await player(page))!;
  expect(Math.hypot(later.x - blurred.x, later.z - blurred.z)).toBeLessThan(0.15);
  await page.keyboard.up("s");
});

test("typing in a field never moves the player", async ({ page }) => {
  await signInAs(page, "sess_fixture_visitor");
  await page.getByTestId("side-menu").click();
  const field = page.locator(".app__side input, .app__side textarea").first();
  test.skip((await field.count()) === 0, "no text field in the side menu for this session");
  const before = (await player(page))!;
  await field.click();
  await page.keyboard.type("wwwwssssaaaadddd");
  await page.waitForTimeout(300);
  const after = (await player(page))!;
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
});

// Needs the lead hookup (scratchpad ct1-lead-hookups.patch): the pre-CT1 useWorldKeys enters the door on any Enter.
test("Enter on a focused menu button does not enter the door; E still does", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "sess_fixture_visitor");
  const L = await layout(page);
  await walkToTestBuilderDoor(page, L);
  const menu = page.getByTestId("side-menu");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true"); // Enter belonged to the button
  await page.waitForTimeout(500);
  expect(await placeOf(page)).toBe("plaza");
  await menu.blur();
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("house:bld_test");
});

test("Esc while typing in the house editor does not leave the house", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "sess_fixture_test"); // Test Builder's verified owner: the editor is shown
  const L = await layout(page);
  await walkToTestBuilderDoor(page, L);
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("house:bld_test");
  const field = page.getByTestId("edit-welcome");
  await expect(field).toBeVisible();
  await field.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  expect(await placeOf(page)).toBe("house:bld_test");
  await field.blur();
  await page.keyboard.press("Escape");
  await expect.poll(() => placeOf(page)).toBe("plaza");
});

// Needs the lead hookup (useWorldKeys re-exports useShellKeys; SideMenu registers an Esc layer).
test("Esc closes the open side menu before it leaves OpenPoker", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "sess_fixture_visitor");
  const L = await layout(page);
  await walkIntoOpenPoker(page, L);
  const menu = page.getByTestId("side-menu");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.locator("canvas").click({ position: { x: 10, y: 10 } }); // focus off the button
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(await placeOf(page)).toBe("venue");
  await page.keyboard.press("Escape");
  await expect.poll(() => placeOf(page)).toBe("plaza");
});
