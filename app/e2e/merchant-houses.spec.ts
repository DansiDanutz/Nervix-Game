import { test, expect, type Page } from "@playwright/test";
import * as walk from "./helpers/walk";

/**
 * B4: every published house on a manifest plot is drawn as a K2 house whose
 * sign board (only the `k2_sign_blank` primitive, not the wood frame) carries
 * the runtime-painted merchant sign. Reads the DEV hook `window.__nervixHouses`
 * that MerchantHouse sets.
 * Needs the lead's scene hookup (<MerchantHouses> mounted in the street scene).
 * NOT RUN by the B4 repair worker (fidelity workflow holds the GPU and E2E ports).
 */
type HouseReport = { propertyId: string; variant: string; plotId: string; signMeshes: number };
type WorldHouses = { houses: { propertyId: string; plotId: string }[] };

const reports = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixHouses?: Record<string, HouseReport> }).__nervixHouses ?? {});

/** Manifest plots marked built: false: street lots a runtime K2 house may stand on (B2 plots on modelled facades are not). */
const streetLots = (page: Page) =>
  page.evaluate(async () =>
    ((await (await fetch("/slice/manifest.json")).json()).runtime_layout?.plots ?? []).filter((p: { built?: boolean }) => p.built === false).length as number);

test("each listed merchant house is drawn once with exactly one painted sign mesh", async ({ page }) => {
  test.setTimeout(180_000);
  await walk.signInAs(page, "sess_fixture_visitor");
  test.skip((await streetLots(page)) === 0, "every B2 manifest plot is a facade Blender modelled: no runtime K2 house is drawn");
  const res = await page.request.get("/api/world/houses");
  expect(res.ok()).toBe(true);
  const listed = ((await res.json()) as WorldHouses).houses;
  expect(listed.length).toBeGreaterThan(0);
  await expect.poll(async () => Object.keys(await reports(page)).length, { timeout: 60_000 }).toBeGreaterThan(0);
  const drawn = await reports(page);
  for (const report of Object.values(drawn)) {
    expect(report.signMeshes, `${report.propertyId} ${report.variant}`).toBe(1);
    expect(listed.some((h) => h.propertyId === report.propertyId && h.plotId === report.plotId)).toBe(true);
  }
  expect(new Set(Object.values(drawn).map((r) => r.plotId)).size).toBe(Object.keys(drawn).length);
});
