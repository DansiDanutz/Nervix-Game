// Scene-wave hookups (W2/W3 hand-offs): source-level wiring checks; behaviour is covered by the E2E specs.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

test("the scene draws the crowd, chat bubbles and directory houses, and the canvas never scrolls on touch", () => {
  const scene = read("scene", "SceneView.tsx");
  assert.match(scene, /<RemoteCrowd players=\{props\.players\} \/>/);
  assert.match(scene, /<ChatBubbles players=\{props\.players\} \/>/);
  assert.match(scene, /<MerchantHouses houses=\{directory\.houses\} plots=\{directory\.streetPlots\} builtPlotIds=\{directory\.builtPlotIds\} \/>/);
  assert.match(scene, /<MerchantNpcs\b/);
  assert.match(scene, /doors=\{\[\.\.\.props\.directory\.plazaDoors\]\}/);
  assert.match(scene, /doors=\{\[\.\.\.props\.directory\.salonDoors\]\}/);
  assert.match(scene, /touchAction: "none"/);
  assert.doesNotMatch(scene, /RemotePlayers|testBuilderDoor\(|danggDoor\(/);
  assert.equal(existsSync(join(SRC, "scene", "RemotePlayers.tsx")), false);
});

test("the house room lays out the K2 template with live products and the merchant's NPC", () => {
  const room = read("scene", "InteriorRoom.tsx");
  assert.match(room, /name="nervix_interior"/);
  assert.match(room, /interiorTemplate\(selectVariant\(kit, door\.propertyId/);
  assert.match(room, /<ProductDisplays house=\{listings\} slots=\{template\.displaySlots\} onSelect=\{onSelect\} \/>/);
  assert.match(room, /productSelection\.select\(door\.propertyId, id\)/);
  assert.match(room, /<InteriorMerchantNpc house=\{house\} station=\{template\.npcStation\} \/>/);
  assert.doesNotMatch(room, /isDangg|interiorFor|bld_dangg/);
  assert.doesNotMatch(read("scene", "HouseDoors.tsx"), /HOUSE_INTERIORS|interiorFor/);
});

test("the local player wears the skinned K1 avatar with the old one as fallback, and the camera pulls in", () => {
  const controller = read("player", "PlayerController.tsx");
  assert.match(controller, /<LocalAvatar preset=\{preset\}/);
  assert.match(controller, /withTouch\(driveFrom\(keys\.current, touch\), touchPad\.get\(\)\)/);
  assert.match(controller, /pulledInCamera\(\{/);
  assert.match(controller, /scaleLook\(controlSettingsStore\.get\(\), dx, dy\)/);
  assert.match(controller, /bindPointerLockLook\(gl\.domElement, document,/);
  assert.doesNotMatch(controller, /g\.rotation\.y =/, "SkinnedAvatar turns itself; the parent must not");
  const local = read("player", "LocalAvatar.tsx");
  assert.match(local, /<ContactShadow height=\{AVATAR_HEIGHT\} \/>/);
  assert.match(local, /fallback=\{<Avatar palette=\{LOCAL_PALETTE\} shadow=\{false\} \/>\}/);
});

test("the shell mounts the a11y layer and the always-on pad, and registers privacy and control settings", () => {
  const app = read("App.tsx");
  assert.match(app, /<A11yLayer place=\{place\} target=\{target\} \/>/);
  assert.match(app, /<InteriorCatalog door=\{interior\} onHouse=\{houseSnapshot\.set\} \/>/);
  assert.match(app, /targetAt\(place, layout, x, z, directory\)/);
  assert.doesNotMatch(app, /\{entered && target && \(\s*<TouchControls/);
  const panels = read("features", "sidePanels.tsx");
  assert.match(panels, /avatarPanel, privacyPanel, controlSettingsPanel\]/);
});

test("remote players and street NPCs lay contact shadows on the baked square (the paving gets no shadow map)", () => {
  const crowd = read("world3d", "RemoteCrowd.tsx");
  assert.match(crowd, /placeContactShadows\(shadowSlots\.current, next\)/);
  assert.match(crowd, /<CrowdContactShadows slots=\{shadowSlots\.current\} \/>/);
  const shadows = read("world3d", "RemoteCrowdShadows.tsx");
  assert.match(shadows, /if \(!sun\) return null;/, "no decals where real shadow maps are used");
  assert.match(shadows, /<ContactShadow height=\{AVATAR_HEIGHT\} \/>/);
  assert.match(read("world3d", "MerchantNpcs.tsx"), /<ContactShadow height=\{AVATAR_HEIGHT\} \/>/);
});

test("on the plaza only wall-scale boxes stop the camera boom; the house keeps its room walls", () => {
  const scene = read("scene", "SceneView.tsx");
  assert.match(scene, /plazaCameraBlockers\(plazaLayout\.obstacles, plazaLayout\.fountain\)/);
  assert.match(scene, /place\.kind === "house" \? ROOM_WALLS/);
  assert.match(scene, /cameraBlockers=\{cameraBlockers\}/);
});
