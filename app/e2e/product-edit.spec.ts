import { test, expect, type Browser, type Page } from "@playwright/test";
import * as walk from "./helpers/walk";

/**
 * P4: the owner adds a categorised listing in the house editor and its 3D
 * product appears only in their own room; a visitor sees no controls; cross
 * owner and subscription-only API edits are 403; clicking a product opens a
 * read-only card; no /orders or payment-link request is ever made.
 * Needs the lead's scene hookup (ProductDisplays mounted in InteriorRoom with
 * house = the house InteriorCatalog reports through onHouse, and
 * onSelect → productSelection.select). Fixture sessions, throwaway database.
 * NOT RUN by the P4 worker (fidelity workflow holds the GPU and E2E ports).
 */
type Products = { propertyId: string; placed: string[]; overflow: string[]; select: (id: string) => boolean };

const products = (page: Page) => page.evaluate(() => {
  const p = (window as unknown as { __nervixProducts?: Products }).__nervixProducts;
  return p ? { propertyId: p.propertyId, placed: p.placed, overflow: p.overflow } : null;
});
const selectProduct = (page: Page, id: string) => page.evaluate((listingId) => (window as unknown as { __nervixProducts?: Products }).__nervixProducts?.select(listingId) ?? false, id);

function recordCheckoutCalls(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r) => {
    if (/\/orders\b|payment[-_]?link/i.test(r.url())) hits.push(r.url());
  });
  return hits;
}

async function enterTestBuilder(page: Page, session: string) {
  await walk.signInAs(page, session);
  const L = await walk.layout(page);
  await walk.walkToTestBuilderDoor(page, L);
  await page.keyboard.press("e");
  await expect.poll(() => walk.placeOf(page)).toBe("house:bld_test");
  await expect(page.getByTestId("house-panel")).toBeVisible();
}

async function contextAs(browser: Browser, session: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await walk.signInAs(page, session);
  return page;
}

test("the owner adds a categorised listing and it appears as a product only in their room", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const checkout = recordCheckoutCalls(page);
  const name = `P4 Iced Tea ${Date.now()}`;
  await enterTestBuilder(page, "sess_fixture_test");

  const form = page.getByTestId("listing-new");
  await form.getByTestId("listing-new-name").fill(name);
  await form.getByTestId("listing-new-price").fill("3.20");
  await form.getByTestId("listing-new-category").selectOption("drink");
  await form.getByTestId("listing-new-slot").selectOption("1");
  await form.getByTestId("listing-new-add").click();
  await expect(page.getByTestId("edit-status")).toHaveText("Listing added");

  const own = await page.request.get("/api/houses/prop_test");
  const added = ((await own.json()) as { house: { listings: { id: string; name: string; category: string; slot: number }[] } }).house.listings.find((l) => l.name === name);
  expect(added?.category).toBe("drink");
  expect(added?.slot).toBe(0);
  // No reload: the panel's onSaved reload re-sends the house to ProductDisplays.
  await expect.poll(async () => (await products(page))?.placed ?? []).toContain(added!.id);

  const other = await contextAs(browser, "sess_fixture_visitor");
  const dangg = await other.request.get("/api/houses/prop_dangg");
  expect(((await dangg.json()) as { house: { listings: { id: string }[] } }).house.listings.map((l) => l.id)).not.toContain(added!.id);
  await other.context().close();
  expect(checkout).toEqual([]);
});

test("the owner deactivates a listing and visitors no longer see it", async ({ page }) => {
  test.setTimeout(300_000);
  await enterTestBuilder(page, "sess_fixture_test");
  const row = page.getByTestId("listing-edit-off_test_1");
  await row.locator("summary").click();
  await row.getByTestId("listing-off_test_1-toggle").click();
  await expect(page.getByTestId("edit-status")).toHaveText("Listing deactivated");
  const visitor = await page.context().browser()!.newContext();
  const v = await visitor.newPage();
  await walk.signInAs(v, "sess_fixture_visitor");
  const seen = await v.request.get("/api/houses/prop_test");
  expect(((await seen.json()) as { house: { listings: { id: string }[] } }).house.listings.map((l) => l.id)).not.toContain("off_test_1");
  await visitor.close();
  // Restore for later specs.
  await row.locator("summary").click();
  await page.getByTestId("listing-edit-off_test_1").getByTestId("listing-off_test_1-toggle").click();
  await expect(page.getByTestId("edit-status")).toHaveText("Listing reactivated");
});

test("a visitor sees no edit controls; clicking a product opens a read-only card", async ({ page }) => {
  test.setTimeout(300_000);
  const checkout = recordCheckoutCalls(page);
  await enterTestBuilder(page, "sess_fixture_visitor");
  await expect(page.getByTestId("house-editor")).toHaveCount(0);
  await expect(page.getByTestId("listing-new")).toHaveCount(0);

  await expect.poll(async () => (await products(page))?.propertyId).toBe("prop_test");
  const [first] = (await products(page))!.placed;
  expect(await selectProduct(page, first)).toBe(true);
  const card = page.getByTestId("product-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-listing-id", first);
  await expect(card).toContainText("demo · display only");
  await expect(card.locator("input, select, textarea, form")).toHaveCount(0);
  await expect(card.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /buy|checkout|pay\b|order/i })).toHaveCount(0);
  await card.getByTestId("product-card-close").click();
  await expect(card).toHaveCount(0);
  expect(checkout).toEqual([]);
});

/** PATCH cases: the listing is outside the caller's own catalogue (or they have no merchant). */
const PATCH_CASES: readonly (readonly [string, string, string])[] = [
  ["sess_fixture_dangg", "prop_test", "off_test_1"],
  ["sess_fixture_dangg", "prop_dangg", "off_test_1"],
  ["sess_fixture_sub", "prop_dangg", "off_dangg_1"],
];
/** POST cases: only callers who do not own the house (DanGG owns prop_dangg, so never DanGG → prop_dangg). */
const ADD_CASES: readonly (readonly [string, string])[] = [
  ["sess_fixture_dangg", "prop_test"],
  ["sess_fixture_sub", "prop_dangg"],
];

test("cross-owner and subscription-only listing edits through the API are 403", async ({ browser }) => {
  for (const [session, prop, id] of PATCH_CASES) {
    const page = await contextAs(browser, session);
    for (const data of [{ category: "drink" }, { slot: 3 }, { active: false }]) {
      const r = await page.request.patch(`/api/houses/${prop}/listings/${id}`, { data });
      expect(r.status(), `${session} ${prop}/${id} ${JSON.stringify(data)}`).toBe(403);
    }
    await page.context().close();
  }
  for (const [session, prop] of ADD_CASES) {
    const page = await contextAs(browser, session);
    const add = await page.request.post(`/api/houses/${prop}/listings`, { data: { name: "x", priceMinor: 1, category: "drink" } });
    expect(add.status(), `${session} add to ${prop}`).toBe(403);
    await page.context().close();
  }
});

test("the owner's invalid listing input is a 400 and adds nothing", async ({ browser }) => {
  const page = await contextAs(browser, "sess_fixture_test");
  const bad = await page.request.post("/api/houses/prop_test/listings", { data: { name: "P4 bad", priceMinor: 1, category: "weapon" } });
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe("invalid_category");
  const own = await page.request.get("/api/houses/prop_test");
  expect(((await own.json()) as { house: { listings: { name: string }[] } }).house.listings.map((l) => l.name)).not.toContain("P4 bad");
  await page.context().close();
});
