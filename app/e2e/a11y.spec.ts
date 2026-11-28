import { test, expect, type Page } from "@playwright/test";
import { layout, placeOf, signInAs, walkRoute } from "./helpers/walk";

/**
 * CT5 accessibility and control settings. @axe-core/playwright is not
 * installed (and installs are not allowed in this wave), so this is a manual
 * role/name check: every control has an accessible name, ids are unique, the
 * live region is a polite status. Swap in an axe scan when the package lands.
 * Depends on the lead's hookups: <A11yLayer> in App.tsx and the
 * controlSettingsPanel registration in sidePanels.tsx.
 */

const VISITOR = "sess_fixture_visitor";
const region = (page: Page) => page.getByTestId("live-region");

/** Controls with no accessible name (aria-label, aria-labelledby, <label>, text, title or alt). */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=checkbox], [role=slider]";
    const named = (el: Element) => {
      const aria = el.getAttribute("aria-label")?.trim();
      const by = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).join("");
      const labels = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels ?? []).map((l) => l.textContent?.trim()).join("") : "";
      const text = el.textContent?.trim();
      return Boolean(aria || by || labels || text || el.getAttribute("title") || el.getAttribute("alt"));
    };
    return Array.from(document.querySelectorAll(sel))
      .filter((el) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0)
      .filter((el) => !named(el))
      .map((el) => el.outerHTML.slice(0, 120));
  });
}

async function duplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
}

async function openControls(page: Page) {
  await page.getByTestId("side-menu").click();
  await page.getByRole("button", { name: "Controls and accessibility" }).click();
  await expect(page.getByTestId("control-settings")).toBeVisible();
}

test("the live region is a polite atomic status, present before anything is announced", async ({ page }) => {
  await signInAs(page, VISITOR);
  await expect(region(page)).toHaveAttribute("role", "status");
  await expect(region(page)).toHaveAttribute("aria-live", "polite");
  await expect(region(page)).toHaveAttribute("aria-atomic", "true");
  await expect(region(page)).toHaveText("");
});

test("reaching the OpenPoker doors announces Enter OpenPoker, then the salon on entry", async ({ page }) => {
  await signInAs(page, VISITOR);
  const L = await layout(page);
  const fx = L.facade_door.x + Math.sin(L.facade_door.yaw ?? 0) * 2;
  const fz = L.facade_door.z + Math.cos(L.facade_door.yaw ?? 0) * 2;
  await walkRoute(page, fx, fz, 1.0, L);
  await expect(region(page)).toHaveText("Enter OpenPoker");
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("venue");
  await expect(region(page)).toHaveText("Inside the OpenPoker salon");
  // The door prompt that had focus is gone: focus is parked on the anchor, not lost on <body>.
  await expect(page.getByTestId("focus-anchor")).toBeFocused();
});

test("every visible control has a role name and ids are unique (manual check, no axe)", async ({ page }) => {
  await signInAs(page, VISITOR);
  expect(await unnamedControls(page)).toEqual([]);
  await openControls(page);
  expect(await unnamedControls(page)).toEqual([]);
  expect(await duplicateIds(page)).toEqual([]);
  await expect(page.getByRole("slider", { name: "Look sensitivity" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Invert Y/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Lock the pointer/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Reduce motion" })).toBeVisible();
});

test("the settings panel takes focus on open and Esc hands it back to the opener", async ({ page }) => {
  await signInAs(page, VISITOR);
  await openControls(page);
  await expect(page.getByRole("heading", { name: "Controls" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("control-settings")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Controls and accessibility" })).toBeFocused();
  await expect.poll(() => placeOf(page)).toBe("plaza");
});

test("settings persist in this browser across a reload", async ({ page }) => {
  await signInAs(page, VISITOR);
  await openControls(page);
  await page.getByTestId("control-invert-y").check();
  await page.getByTestId("control-sensitivity").fill("2");
  await page.reload();
  await page.locator("canvas").waitFor();
  await openControls(page);
  await expect(page.getByTestId("control-invert-y")).toBeChecked();
  await expect(page.getByTestId("control-sensitivity")).toHaveValue("2");
});

test("storage that throws falls back to defaults and the world still loads", async ({ page }) => {
  // Only the controls key throws: net/session.ts reads localStorage unguarded (outside this lane).
  await page.addInitScript(() => {
    const { getItem, setItem } = Storage.prototype;
    const KEY = "nervix.controls.v1";
    Storage.prototype.getItem = function (k: string) { if (k === KEY) throw new DOMException("blocked", "SecurityError"); return getItem.call(this, k); };
    Storage.prototype.setItem = function (k: string, v: string) { if (k === KEY) throw new DOMException("full", "QuotaExceededError"); return setItem.call(this, k, v); };
  });
  await signInAs(page, VISITOR);
  await openControls(page);
  await expect(page.getByTestId("control-invert-y")).not.toBeChecked();
  await page.getByTestId("control-invert-y").check();
  await expect(page.getByTestId("control-invert-y")).toBeChecked();
});

test("reduced motion follows the OS under 'system' and the setting overrides it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAs(page, VISITOR);
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  await openControls(page);
  await page.getByRole("radio", { name: "Full motion" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "false");
});
