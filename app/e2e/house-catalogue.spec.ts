import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * P5 one catalogue source per house. The merchant agent of each house answers
 * from that house's visible listings (builder_offerings) only: DanGG's agent
 * knows DanGG's listings, Test Builder's agent knows Test Builder's, and
 * neither leaks the other's. Fixture sessions only (NODE_ENV=test server,
 * throwaway database). No payment is made: no checkout is confirmed here.
 */

async function openAs(browser: Browser, session: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("canvas").waitFor();
  return page;
}

type Reply = { text: string };
type House = { house: { listings: { id: string; name: string }[] } };

async function ask(page: Page, propertyId: string, message: string): Promise<Reply> {
  const res = await page.request.post(`/api/agent/${propertyId}/message`, { data: { message } });
  expect(res.status()).toBe(200);
  return res.json() as Promise<Reply>;
}

async function listingNames(page: Page, propertyId: string): Promise<string[]> {
  const res = await page.request.get(`/api/houses/${propertyId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as House).house.listings.map((l) => l.name);
}

test("each house's merchant agent answers from its own visible listings only", async ({ browser }) => {
  const page = await openAs(browser, "sess_fixture_visitor");
  const danggNames = await listingNames(page, "prop_dangg");
  const testNames = await listingNames(page, "prop_test");
  expect(danggNames).toContain("DanGG Starter Bundle");
  expect(testNames).toContain("Test Builder Widget");

  expect((await ask(page, "prop_dangg", "starter bundle")).text).toContain("DanGG Starter Bundle");
  expect((await ask(page, "prop_test", "widget")).text).toContain("Test Builder Widget");

  expect((await ask(page, "prop_test", "starter bundle")).text).not.toContain("DanGG");
  expect((await ask(page, "prop_dangg", "widget")).text).not.toContain("Test Builder Widget");
  await page.context().close();
});
