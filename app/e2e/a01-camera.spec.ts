import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * V1: the game renders the judged A01 camera (CAM_A01 from blender/scripts/arrival_camera.py) and
 * captures the frame for the reference | Blender | game strip (scripts/compare-a01.mjs).
 * ?cam=a01 is a DEV-only override (app/src/scene/devCamera.ts).
 */
const EVIDENCE = "../docs/evidence/slice";
const WIDTH = 1672;
const HEIGHT = 941;
const POSITION_TOLERANCE_M = 0.01;
const ANGLE_TOLERANCE_DEG = 0.5;

type Vec3 = [number, number, number];
type PoseFile = { position: Vec3; target: Vec3; fov: number; width: number; height: number };
type DevCam = { ready: boolean; error: string | null; position: Vec3; direction: Vec3; fov: number; frames: number; avatarHidden: boolean };

const POSE: PoseFile = JSON.parse(readFileSync(new URL("../public/slice/a01-camera.json", import.meta.url), "utf8"));

const devCam = (page: Page) => page.evaluate(() => (window as unknown as { __nervixDevCamera?: DevCam }).__nervixDevCamera ?? null);
const arrivalLoaded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nervixArrival?: { loaded: boolean } }).__nervixArrival?.loaded ?? false);

const unit = (v: number[]): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const angleDeg = (a: Vec3, b: Vec3) => {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(dot) * 180) / Math.PI;
};

/** Fresh player through the normal gate: sign up, verify the demo code, enter (as in arrival.spec.ts). */
async function enterAsFreshPlayer(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account|sign up|new here/i }).first().click().catch(() => {});
  const email = `a01cam_${Date.now()}@fixture.nervix.invalid`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const code = (await page.locator(".gate__hint strong").textContent())?.trim() ?? "";
  await page.getByPlaceholder("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.locator("canvas").waitFor();
}

test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

test("A01 camera: the game frame matches CAM_A01 within 1 cm and 0.5 degrees", async ({ page }) => {
  expect([POSE.width, POSE.height]).toEqual([WIDTH, HEIGHT]);
  await enterAsFreshPlayer(page);
  // The verified session resumes on reload; the override is read from the URL at mount.
  await page.goto("/?cam=a01");
  await page.locator("canvas").waitFor();
  await expect
    .poll(() => arrivalLoaded(page), { timeout: 60_000, message: "arrival GLB never appeared in the scene" })
    .toBe(true);
  await expect
    .poll(async () => (await devCam(page))?.ready ?? false, { timeout: 30_000, message: "dev camera never applied the A01 pose" })
    .toBe(true);
  await page.waitForLoadState("networkidle");

  // Settled: the override has held the pose over many frames and the pose is stable.
  const first = (await devCam(page))!;
  await expect.poll(async () => ((await devCam(page))?.frames ?? 0) - first.frames, { timeout: 15_000 }).toBeGreaterThan(30);
  await page.waitForTimeout(500);
  const cam = (await devCam(page))!;
  expect(cam.error).toBeNull();

  const dp = cam.position.map((v, i) => Math.abs(v - POSE.position[i]));
  expect(Math.max(...dp), `position ${JSON.stringify(cam.position)} vs ${JSON.stringify(POSE.position)}`).toBeLessThanOrEqual(POSITION_TOLERANCE_M);
  const expectedDir = unit(POSE.target.map((t, i) => t - POSE.position[i]));
  const off = angleDeg(unit(cam.direction), expectedDir);
  expect(off, `direction ${JSON.stringify(cam.direction)} vs ${JSON.stringify(expectedDir)}`).toBeLessThanOrEqual(ANGLE_TOLERANCE_DEG);
  expect(Math.abs(cam.fov - POSE.fov)).toBeLessThanOrEqual(ANGLE_TOLERANCE_DEG);

  // The frame shows only the world: avatar hidden, no HUD or notice over the canvas.
  expect(cam.avatarHidden).toBe(true);
  const overlays = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".app > *"))
      .filter((el) => !el.querySelector("canvas") && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().width > 0)
      .map((el) => el.className || el.tagName),
  );
  expect(overlays).toEqual([]);
  const canvas = (await page.locator("canvas").boundingBox())!;
  expect(Math.round(canvas.width)).toBe(WIDTH);
  expect(Math.round(canvas.height)).toBe(HEIGHT);

  await page.screenshot({ path: `${EVIDENCE}/game-A01-camera.png` });
});
