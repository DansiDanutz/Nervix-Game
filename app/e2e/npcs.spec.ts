import { test, expect, type Browser, type Page } from "@playwright/test";
import { signInAs } from "./helpers/sliceWalk";

/**
 * C8 merchant NPCs. One "AI representative" per directory house, named from the API; no NPC for
 * the unverified merchant; a suspended merchant's NPC goes away on reload.
 *
 * Needs the lead's scene hookup: <MerchantNpcs houses plots> mounted beside <MerchantHouses> in
 * SceneView (it publishes the DEV hook window.__nervixNpcs). The canvas label is checked through
 * the hook and the scene graph, since it is drawn on a sprite, not in the DOM.
 * NOT RUN by the C8 worker (the fidelity workflow holds the GPU and the E2E ports).
 */
type NpcEntry = { propertyId: string; name: string; role: string; affiliation: string; placed: boolean };
type WorldHouse = { plotId: string; propertyId: string; merchantName: string; verified: boolean };

const VISITOR = "sess_fixture_visitor";
const ADMIN = "sess_fixture_admin";
const ROLE = "AI representative";

const npcs = (page: Page) => page.evaluate(() => (window as unknown as { __nervixNpcs?: NpcEntry[] }).__nervixNpcs ?? null);
const directory = async (page: Page) => ((await (await page.request.get("/api/world/houses")).json()) as { houses: WorldHouse[] }).houses;

async function openAs(browser: Browser, session: string) {
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, session);
  await expect.poll(() => npcs(page), { timeout: 30_000 }).not.toBeNull();
  return page;
}

test("one AI representative per directory house, named from the API, never for the unverified merchant", async ({ browser }) => {
  const page = await openAs(browser, VISITOR);
  const houses = await directory(page);
  const list = (await npcs(page))!;
  expect(list.map((n) => n.propertyId)).toEqual(houses.map((h) => h.propertyId));
  for (const n of list) {
    const house = houses.find((h) => h.propertyId === n.propertyId)!;
    expect(n.name).toBe(house.merchantName);
    expect(n.role).toBe(ROLE);
    expect(n.affiliation).toBe("Verified merchant");
  }
  const names = list.map((n) => n.name);
  expect(names).toContain("DanGG");
  expect(names).toContain("Test Builder");
  expect(names).not.toContain("Unverified Shop");
  expect(list.map((n) => n.propertyId)).not.toContain("prop_unverified");
  expect(JSON.stringify(list)).not.toMatch(/usr_|mer_|sess_/);
});

test("every street house with a manifest plot has its NPC in the scene at the station", async ({ browser }) => {
  const page = await openAs(browser, VISITOR);
  const plots: string[] = await page.evaluate(async () =>
    ((await (await fetch("/slice/manifest.json")).json()).runtime_layout?.plots ?? []).map((p: { id: string }) => p.id));
  test.skip(plots.length === 0, "the slice manifest has no runtime_layout.plots yet (B2)");
  const houses = (await directory(page)).filter((h) => plots.includes(h.plotId));
  await expect.poll(async () => (await npcs(page))!.filter((n) => n.placed).map((n) => n.propertyId).sort(), { timeout: 30_000 })
    .toEqual(houses.map((h) => h.propertyId).sort());
});

test("suspend, reload: the merchant's NPC is gone; reinstate brings it back", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.context().addCookies([{ name: "nervix_session", value: ADMIN, domain: "127.0.0.1", path: "/" }]);
  const set = (suspended: boolean) => admin.request.post(`/api/admin/merchants/mer_test/${suspended ? "suspend" : "reinstate"}`, { data: {} });
  expect((await set(true)).ok()).toBe(true);
  try {
    const page = await openAs(browser, VISITOR);
    expect((await npcs(page))!.map((n) => n.name)).not.toContain("Test Builder");
  } finally {
    expect((await set(false)).ok()).toBe(true);
  }
  const back = await openAs(browser, VISITOR);
  expect((await npcs(back))!.map((n) => n.name)).toContain("Test Builder");
});
