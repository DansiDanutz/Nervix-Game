import { test, expect, type Browser, type Page } from "@playwright/test";
import { layout, placeOf, signInAs, walkToTestBuilderDoor } from "./helpers/walk";

/**
 * CT2: talk to the merchant inside the Test Builder house.
 * Fixture sessions only (NODE_ENV=test server, throwaway database). Captions only.
 * Each player's conversation is private to them and the merchant's assistant (S3).
 * The panels live in the interior host (data-testid="interior-panels"), not in the
 * side menu, which the shell hides inside houses: every check uses toBeVisible.
 * Needs the lead's App.tsx hookups (InteriorPanelHost mounted, useShellKeys for Esc).
 */
const FACT = `Test Builder fixture fact ${Date.now()}: the long test bench opens at nine.`;
const QUESTION = "When does the long test bench open?";

type Turn = { role: string; content: string };

async function api<T>(page: Page, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ path, body }) => {
    const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(`/api${path}`, init);
    return { status: res.status, body: await res.json() };
  }, { path, body });
}

/** The verified owner adds and approves one knowledge fact, so a reply can be grounded on it. */
async function seedKnowledge(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInAs(page, "sess_fixture_test");
  const added = await api<{ id: string }>(page, "/merchants/mer_test/knowledge", { kind: "faq", content: FACT });
  expect(added.status).toBe(200);
  const approved = await api(page, `/merchants/mer_test/knowledge/${added.body.id}/approve`, {});
  expect(approved.status).toBe(200);
  await ctx.close();
}

async function enterTestBuilder(page: Page) {
  const L = await layout(page);
  await walkToTestBuilderDoor(page, L);
  await page.keyboard.press("e");
  await expect.poll(() => placeOf(page)).toBe("house:slot-12");
}

async function openTalk(page: Page) {
  await expect(page.getByTestId("interior-panels")).toBeVisible();
  await expect(page.getByTestId("talk-open")).toBeVisible();
  await page.getByTestId("talk-open").click();
  await expect(page.getByTestId("talk-merchant")).toBeVisible();
  await expect(page.getByTestId("talk-merchant")).toHaveAttribute("data-property", "prop_test");
}

async function ask(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByLabel("Message").press("Enter");
  await expect(page.getByTestId("merchant-chat-log").locator('[data-role="agent"]').last()).toBeVisible();
}

test("a visitor walks into Test Builder, talks, and gets a grounded, private reply", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await seedKnowledge(browser);

  await signInAs(page, "sess_fixture_visitor");
  await enterTestBuilder(page);
  await openTalk(page);
  await expect(page.getByTestId("merchant-chat-privacy")).toContainText("private to you and the merchant's assistant");
  await expect(page.getByTestId("merchant-chat-privacy")).toContainText("not shared with other players");
  await expect(page.getByTestId("merchant-chat-privacy")).toContainText("Support requests you confirm are sent to the merchant");
  await expect(page.getByTestId("workspace-open")).toHaveCount(0); // visitors never see the workspace

  // Typing in the chat never moves the player or leaves the house.
  await ask(page, QUESTION);
  await expect(page.getByTestId("merchant-chat-log").locator('[data-role="agent"]').last()).toContainText("opens at nine");
  await expect.poll(() => placeOf(page)).toBe("house:slot-12");

  // A second player in the same house sees none of the first one's transcript.
  const other = await browser.newContext();
  const second = await other.newPage();
  await signInAs(second, "sess_fixture_sub");
  await enterTestBuilder(second);
  await openTalk(second);
  await expect(second.getByTestId("merchant-chat-log")).not.toContainText(QUESTION);
  const mine = await api<{ history: Turn[] }>(second, "/agent/prop_test/message", { message: "hello" });
  expect(mine.status).toBe(200);
  expect(mine.body.history.map((t) => t.content)).not.toContain(QUESTION);
  await other.close();
});

test("only the verified owner sees the merchant workspace inside their house", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, "sess_fixture_test");
  const menu = page.getByTestId("side-menu");
  await menu.click();
  await expect(page.getByTestId("workspace-open")).toHaveCount(0); // not on the plaza
  await menu.click();
  await enterTestBuilder(page);
  await expect(page.getByTestId("workspace-open")).toBeVisible();
  await expect(page.getByTestId("talk-open")).toBeVisible();
  await page.getByTestId("workspace-open").click();
  await expect(page.getByTestId("workspace-open")).toHaveCount(0); // the workspace replaced its button
});

test("Esc closes the chat first and the player stays in the house; a second Esc leaves", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, "sess_fixture_visitor");
  await enterTestBuilder(page);
  await openTalk(page);
  await page.getByLabel("Message").blur(); // Esc in a field is typing, never a shell key
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("talk-merchant")).toHaveCount(0);
  await expect(page.getByTestId("talk-open")).toBeVisible();
  await expect.poll(() => placeOf(page)).toBe("house:slot-12");
  await page.keyboard.press("Escape");
  await expect.poll(() => placeOf(page)).toBe("plaza");
});

test("a support request is proposed, then confirmed by proposal id, with no payment link", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, "sess_fixture_visitor");
  await enterTestBuilder(page);
  await openTalk(page);
  const confirms: unknown[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/agent/prop_test/confirm")) confirms.push(r.postDataJSON());
  });
  await page.getByLabel("Message").fill("My demo order has not arrived.");
  await page.getByTestId("merchant-chat-support").click();
  const proposal = page.getByTestId("merchant-chat-proposal");
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText("Send a support request to the merchant");
  await proposal.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("merchant-chat-log")).toContainText("Your support request was sent to the merchant.");
  await expect(proposal).toHaveCount(0);
  expect(confirms).toHaveLength(1);
  expect((confirms[0] as { action: { proposalId?: string } }).action.proposalId).toMatch(/^prp_/);
  await expect(page.getByTestId("merchant-chat-log")).not.toContainText(/https?:\/\//);
});

test("no speech: the merchant panel renders captions only", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, "sess_fixture_visitor");
  await enterTestBuilder(page);
  await openTalk(page);
  await expect(page.getByRole("button", { name: /read aloud/i })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { speechSynthesis?: { speaking: boolean } }).speechSynthesis?.speaking ?? false)).toBe(false);
});
