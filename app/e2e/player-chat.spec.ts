import { test, expect, type Page } from "@playwright/test";
import { layout, player, signInAs, walkIntoDangg } from "./helpers/sliceWalk";

/**
 * CT3 player chat, two browser contexts on fixture sessions. B hears A's line
 * on the plaza; typing "w" into the chat never moves A; a moderated line is
 * refused; once A is inside DanGG's house, B on the plaza hears nothing.
 * Reads the DEV-only `window.__nervixChat` hook from src/net/presenceChatStore.ts:
 * { place, lines: [{ name, text, self }], notice, bubbles }.
 * Needs the lead's App hookup (<PlayerChat />) before it can pass.
 */
type ChatDebug = { place: string; lines: { name: string; text: string; self: boolean }[]; notice: string | null };

const chat = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixChat?: ChatDebug }).__nervixChat ?? null);
const texts = async (page: Page) => (await chat(page))?.lines.map((l) => l.text) ?? [];
const input = (page: Page) => page.getByTestId("player-chat-input");

async function sayLine(page: Page, text: string) {
  await page.locator("canvas").click();
  await page.keyboard.press("t");
  await expect(input(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(input(page)).not.toBeFocused();
}

test("B hears A's line in the same place, in the log and as a bubble", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await Promise.all([signInAs(a, "sess_fixture_visitor"), signInAs(b, "sess_fixture_test")]);
    await expect(a.getByTestId("player-chat")).toBeVisible();

    await sayLine(a, "hello from the fountain");
    await expect.poll(() => texts(b), { timeout: 10_000 }).toContain("hello from the fountain");
    await expect.poll(() => texts(a)).toContain("hello from the fountain");
    await expect(b.getByTestId("player-chat-log")).toContainText("hello from the fountain");
    await expect(b.getByTestId("player-chat-log")).toHaveAttribute("aria-live", "polite");
    const bubbles = await b.evaluate(() => (window as unknown as { __nervixChat?: { bubbles: unknown[] } }).__nervixChat?.bubbles ?? []);
    expect(bubbles.length).toBeGreaterThan(0);
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});

test("typing w into the chat does not move the avatar, and Esc gives the keys back", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await signInAs(page, "sess_fixture_visitor");
    await page.locator("canvas").click();
    const before = (await player(page))!;
    await page.keyboard.press("t");
    await expect(input(page)).toBeFocused();
    await page.keyboard.down("w");
    await page.waitForTimeout(800);
    await page.keyboard.up("w");
    const during = (await player(page))!;
    expect(Math.hypot(during.x - before.x, during.z - before.z)).toBeLessThan(0.05);
    await expect(input(page)).toHaveValue(/w/);

    await page.keyboard.press("Escape");
    await expect(input(page)).not.toBeFocused();
    await page.keyboard.down("w");
    await page.waitForTimeout(800);
    await page.keyboard.up("w");
    const after = (await player(page))!;
    expect(Math.hypot(after.x - during.x, after.z - during.z)).toBeGreaterThan(0.5);
  } finally {
    await ctx.close();
  }
});

test("a moderated line is refused with a notice and reaches nobody", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await Promise.all([signInAs(a, "sess_fixture_visitor"), signInAs(b, "sess_fixture_test")]);
    await sayLine(a, "well shit");
    await expect.poll(async () => (await chat(a))?.notice ?? "", { timeout: 5_000 }).toMatch(/not allowed/i);
    await b.waitForTimeout(1000);
    expect(await texts(b)).not.toContain("well shit");
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});

test("a line said inside DanGG's house never reaches the plaza", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await Promise.all([signInAs(a, "sess_fixture_visitor"), signInAs(b, "sess_fixture_test")]);
    await walkIntoDangg(a, await layout(a));
    await expect.poll(async () => (await chat(a))?.place, { timeout: 10_000 }).toBe("prop_dangg");
    await sayLine(a, "private to the house");
    await expect.poll(() => texts(a), { timeout: 10_000 }).toContain("private to the house");
    await b.waitForTimeout(1500);
    expect(await texts(b)).not.toContain("private to the house");
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
});
