import { test, expect, type Page } from "@playwright/test";
import * as slice from "./helpers/sliceWalk";
import * as walk from "./helpers/walk";

/**
 * P3: live listings become named K3 product objects inside their own house.
 * Reads the DEV hook `window.__nervixProducts` that ProductDisplays sets: the
 * ids of the `product_<listingId>` groups it placed, and the 2D-only overflow.
 * Needs the lead's scene hookup (ProductDisplays mounted in InteriorRoom).
 * NOT RUN by the P3 worker (fidelity workflow holds the GPU and E2E ports).
 */
type Products = { propertyId: string; placed: string[]; overflow: string[] };
type House = { house: { listings: { id: string }[] } };

const products = (page: Page) => page.evaluate(() => (window as unknown as { __nervixProducts?: Products }).__nervixProducts ?? null);

async function visibleIds(page: Page, propertyId: string): Promise<string[]> {
  const res = await page.request.get(`/api/houses/${propertyId}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as House).house.listings.map((l) => l.id).sort();
}

async function expectOwnProducts(page: Page, propertyId: string, foreignPrefix: string) {
  await expect.poll(async () => (await products(page))?.propertyId).toBe(propertyId);
  const shown = (await products(page))!;
  const own = await visibleIds(page, propertyId);
  expect([...shown.placed, ...shown.overflow].sort()).toEqual(own);
  expect(shown.placed.length).toBeGreaterThan(0);
  for (const id of shown.placed) expect(id.startsWith(foreignPrefix)).toBe(false);
  // No checkout path from the interior.
  await expect(page.getByRole("button", { name: /buy|checkout|pay/i })).toHaveCount(0);
}

test("DanGG's room shows only DanGG's listings as product objects", async ({ page }) => {
  test.setTimeout(240_000);
  await slice.signInAs(page, "sess_fixture_visitor");
  const L = await slice.layout(page);
  await slice.walkIntoDangg(page, L);
  await expectOwnProducts(page, "prop_dangg", "off_test_");
});

test("Test Builder's room shows only Test Builder's listings as product objects", async ({ page }) => {
  test.setTimeout(240_000);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await walk.signInAs(page, "sess_fixture_visitor");
  const L = await walk.layout(page);
  await walk.walkToTestBuilderDoor(page, L);
  await page.keyboard.press("e");
  await expect.poll(() => walk.placeOf(page)).toBe("house:slot-12");
  await expectOwnProducts(page, "prop_test", "off_dangg_");
  expect(requests.filter((u) => /^\/api\/(orders\b|.*payment[-_]?link)/i.test(new URL(u).pathname))).toEqual([]);
});

test("the K3 kit and its manifest are served", async ({ page }) => {
  const manifest = await page.request.get("/kits/k3/manifest.json");
  expect(manifest.ok()).toBe(true);
  const glb = await page.request.get(`/kits/k3/${(await manifest.json()).glb}`);
  expect(glb.ok()).toBe(true);
  expect(Number(glb.headers()["content-length"] ?? (await glb.body()).length)).toBeGreaterThan(1000);
});
