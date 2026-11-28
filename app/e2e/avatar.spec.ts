import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * C5 appearance data. Two fixture sessions in separate browser contexts read
 * distinct presets, see them selected in the Appearance panel, and an invalid
 * or cross-user write is refused. Fixture sessions only (NODE_ENV=test server,
 * throwaway database with the fixture avatars applied).
 *
 * Needs the lead's hookups: applyAvatars in server/seed/fixtures/index.mjs and
 * avatarPanel registered in app/src/features/sidePanels.tsx.
 */

async function openAs(browser: Browser, session: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("canvas").waitFor();
  return page;
}

const myAvatar = async (page: Page) => (await page.request.get("/api/me/avatar")).json() as Promise<{ preset: string; source: string }>;

async function openPicker(page: Page) {
  await page.getByTestId("side-menu").click();
  await page.getByRole("button", { name: "Appearance" }).click();
  const picker = page.getByTestId("avatar-picker");
  await expect(picker).toBeVisible();
  return picker;
}

test("two fixture sessions show distinct presets in the API and the picker", async ({ browser }) => {
  const a = await openAs(browser, "sess_fixture_dangg");
  const b = await openAs(browser, "sess_fixture_test");
  const [pa, pb] = [await myAvatar(a), await myAvatar(b)];
  expect(pa).toEqual({ preset: "burgundy", source: "saved" });
  expect(pb).toEqual({ preset: "linen", source: "saved" });

  const pickerA = await openPicker(a);
  const pickerB = await openPicker(b);
  await expect(pickerA).toHaveAttribute("data-saved-preset", "burgundy");
  await expect(pickerB).toHaveAttribute("data-saved-preset", "linen");
  await expect(pickerA.locator('[data-preset="burgundy"]')).toHaveAttribute("aria-checked", "true");
  await expect(pickerB.locator('[data-preset="linen"]')).toHaveAttribute("aria-checked", "true");
  await a.context().close();
  await b.context().close();
});

test("choosing and saving a preset persists across a reload", async ({ browser }) => {
  const page = await openAs(browser, "sess_fixture_visitor");
  // The visitor's fixture preset is teal, which is also the default: only
  // source "saved" proves the seed path wrote a row for this user.
  expect(await myAvatar(page)).toEqual({ preset: "teal", source: "saved" });
  const picker = await openPicker(page);
  await expect(picker).toHaveAttribute("data-saved-preset", "teal");
  await picker.locator('[data-preset="sage"]').click();
  await picker.getByRole("button", { name: "Save appearance" }).click();
  await expect(picker).toHaveAttribute("data-saved-preset", "sage");
  await page.reload();
  expect(await myAvatar(page)).toEqual({ preset: "sage", source: "saved" });
  // Restore the fixture so later specs see the seeded preset.
  await page.request.put("/api/me/avatar", { data: { preset: "teal" } });
  await page.context().close();
});

test("an invalid preset and a cross-user write are refused", async ({ browser }) => {
  const page = await openAs(browser, "sess_fixture_test");
  const bad = await page.request.put("/api/me/avatar", { data: { preset: "purple" } });
  expect(bad.status()).toBe(400);
  const cross = await page.request.put("/api/me/avatar", { data: { preset: "linen", userId: "usr_dangg" } });
  expect(cross.status()).toBe(200);
  const dangg = await openAs(browser, "sess_fixture_dangg");
  expect((await myAvatar(dangg)).preset).toBe("burgundy");
  await page.context().close();
  await dangg.context().close();
});

test("arrow keys move the appearance choice inside the radio group", async ({ browser }) => {
  const page = await openAs(browser, "sess_fixture_dangg");
  const picker = await openPicker(page);
  const current = picker.locator('[data-preset="burgundy"]');
  await expect(current).toHaveAttribute("tabindex", "0");
  await current.focus();
  await page.keyboard.press("ArrowRight");
  const next = picker.locator('[data-preset="linen"]');
  await expect(next).toHaveAttribute("aria-checked", "true");
  await expect(next).toBeFocused();
  await expect(current).toHaveAttribute("tabindex", "-1");
  await expect(picker).toHaveAttribute("data-saved-preset", "burgundy");
  await page.context().close();
});
