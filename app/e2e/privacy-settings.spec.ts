import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * C9 presence privacy. A fixture session turns on "Hide my name" in the
 * Privacy panel, the setting persists over a reload, and another context's
 * presence socket then sees that player as "Anonymous". Fixture sessions only
 * (NODE_ENV=test server, throwaway database with migration 019 applied).
 *
 * Needs the lead's hookup: privacyPanel registered in app/src/features/sidePanels.tsx.
 */

async function openAs(browser: Browser, session: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("canvas").waitFor();
  return page;
}

const myPrivacy = async (page: Page) => (await page.request.get("/api/me/privacy")).json() as Promise<{ hideName: boolean; anonymous: boolean; source: string }>;

async function openPanel(page: Page) {
  await page.getByTestId("side-menu").click();
  await page.getByRole("button", { name: "Privacy" }).click();
  const panel = page.getByTestId("privacy-settings");
  await expect(panel).toHaveAttribute("data-status", "ready");
  return panel;
}

/** Names in the plaza room as a fresh presence socket in `page` receives them. */
const plazaNames = (page: Page) =>
  page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence`);
    const timer = setTimeout(() => reject(new Error("no welcome")), 5000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", place: "plaza" }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.type !== "welcome") return;
      clearTimeout(timer);
      ws.close();
      resolve(msg.players.map((p: { name: string }) => p.name));
    };
  }));

test("hide my name persists and other players see Anonymous", async ({ browser }) => {
  const a = await openAs(browser, "sess_fixture_sub");
  expect(await myPrivacy(a)).toEqual({ hideName: false, anonymous: false, source: "default" });
  const panel = await openPanel(a);
  await panel.getByTestId("privacy-hideName").check();
  await expect(panel.getByTestId("privacy-shown-as")).toContainText("Anonymous");
  await panel.getByTestId("privacy-save").click();
  await expect(panel.getByTestId("privacy-save")).toBeDisabled();
  await a.reload();
  expect(await myPrivacy(a)).toEqual({ hideName: true, anonymous: false, source: "saved" });

  // A joins the plaza on its own socket (cookie-authenticated), independent of the entry gate.
  await a.evaluate(() => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence`);
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", place: "plaza" }));
    (window as unknown as { __privacyProbe?: WebSocket }).__privacyProbe = ws;
  });
  const b = await openAs(browser, "sess_fixture_visitor");
  await expect.poll(() => plazaNames(b), { timeout: 15_000 }).toContain("Anonymous");
  expect(await plazaNames(b)).not.toContain("Subscriber Only");
  await a.context().close();
  await b.context().close();
});

test("a malformed privacy write is refused with 400", async ({ browser }) => {
  const page = await openAs(browser, "sess_fixture_unverified");
  const r = await page.request.put("/api/me/privacy", { data: { hideName: "yes" } });
  expect(r.status()).toBe(400);
  expect((await r.json()).error).toBe("invalid_privacy");
  await page.context().close();
});
