import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * B3 world directory. The API part needs only the server (fixtures include
 * the DEMO directory merchants). The door part needs the lead's scene hookup:
 * SceneView draws joinHouseDirectory(...).doors instead of the hard-coded
 * testBuilderDoor, and HouseDoors/slice.ts no longer carry merchant names.
 * Not run by the B3 worker (the fidelity workflow held the GPU and E2E ports).
 */

type WorldHouse = { plotId: string; propertyId: string; merchantName: string; verified: boolean; theme: string; accent: string };

const ADMIN = "sess_fixture_admin";
const FIXTURE_NAMES = ["DanGG", "Test Builder", "Unverified Shop", "Lantern Books", "Copper Kettle", "Juniper Florist", "Atlas Map Room"];

async function openAs(browser: Browser, session?: string): Promise<Page> {
  const context = await browser.newContext();
  if (session) await context.addCookies([{ name: "nervix_session", value: session, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("canvas").waitFor();
  return page;
}

const directory = async (page: Page) => ((await (await page.request.get("/api/world/houses")).json()) as { houses: WorldHouse[] }).houses;
const setSuspended = (page: Page, merchantId: string, suspended: boolean) =>
  page.request.post(`/api/admin/merchants/${merchantId}/${suspended ? "suspend" : "reinstate"}`, { data: {} });

test("the directory lists at least 6 verified houses, never the unverified one, with public fields only", async ({ browser }) => {
  const page = await openAs(browser);
  const houses = await directory(page);
  expect(houses.length).toBeGreaterThanOrEqual(6);
  expect(houses.map((h) => h.propertyId)).not.toContain("prop_unverified");
  for (const h of houses) expect(Object.keys(h).sort()).toEqual(["accent", "merchantName", "plotId", "propertyId", "theme", "verified"]);
});

/**
 * The door of a directory entry: with manifest plots the join uses the plot id
 * as the door id; before B2 the legacy test-builder door id is the fallback.
 */
const doorOf = (page: Page, house: WorldHouse) =>
  page.getByTestId(`label-${house.plotId}`).or(page.getByTestId("label-bld_test"));

test("suspend, reload: the house leaves the directory and its door is gone; reinstate brings it back", async ({ browser }) => {
  const admin = await openAs(browser, ADMIN);
  const before = await openAs(browser, "sess_fixture_visitor");
  const target = (await directory(before)).find((h) => h.propertyId === "prop_test");
  expect(target, "prop_test must be listed before the suspension").toBeTruthy();
  await expect(doorOf(before, target!)).toHaveCount(1);
  expect((await setSuspended(admin, "mer_test", true)).ok()).toBe(true);
  try {
    const visitor = await openAs(browser, "sess_fixture_visitor");
    expect((await directory(visitor)).map((h) => h.propertyId)).not.toContain("prop_test");
    await expect(doorOf(visitor, target!)).toHaveCount(0);
  } finally {
    await setSuspended(admin, "mer_test", false);
  }
  const again = await openAs(browser, "sess_fixture_visitor");
  expect((await directory(again)).map((h) => h.propertyId)).toContain("prop_test");
  await expect(doorOf(again, target!)).toHaveCount(1);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no fixture merchant name is baked into app/src (identity loads at runtime)", () => {
  const src = fileURLToPath(new URL("../src", import.meta.url));
  const hits = sourceFiles(src).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return FIXTURE_NAMES.filter((name) => text.includes(name)).map((name) => `${file}: ${name}`);
  });
  expect(hits).toEqual([]);
});
