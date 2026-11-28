/**
 * Two-line canvas label over a merchant NPC (C8): the API name, then "AI representative".
 * Drawn as canvas text on a sprite, never as HTML, so a merchant name is never parsed as markup.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MerchantNpc } from "../world/merchantNpcs";
import { npcLabelLines } from "../world/merchantNpcs";

const MAX_NAME = 28;
const CANVAS_W = 320;
const CANVAS_H = 104;
/** World width of the label (m); height follows the canvas aspect. */
const LABEL_W = 1.5;
const LABEL_H = LABEL_W * (CANVAS_H / CANVAS_W);
/** Label centre above the NPC's feet (m). */
export const NPC_LABEL_Y = 2.05;

const clip = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1)}…` : clean;
};

function drawNpcLabel(npc: MerchantNpc): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const [name, role] = npcLabelLines(npc);
  ctx.fillStyle = "rgba(28, 22, 18, 0.66)";
  ctx.beginPath();
  ctx.roundRect(4, 6, CANVAS_W - 8, CANVAS_H - 12, 20);
  ctx.fill();
  ctx.fillStyle = npc.accent;
  ctx.fillRect(18, 14, 6, CANVAS_H - 28);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4ead8";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(clip(name), CANVAS_W / 2 + 6, 38, CANVAS_W - 48);
  ctx.fillStyle = "#d9c9a8";
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(role, CANVAS_W / 2 + 6, 74, CANVAS_W - 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function MerchantNpcLabel({ npc }: { readonly npc: MerchantNpc }) {
  const texture = useMemo(() => drawNpcLabel(npc), [npc]);
  const material = useMemo(
    () => (texture ? new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }) : null),
    [texture],
  );
  useEffect(() => () => {
    material?.dispose();
    texture?.dispose();
  }, [material, texture]);
  if (!material) return null;
  return <sprite name="merchant_npc_label" material={material} position={[0, NPC_LABEL_Y, 0]} scale={[LABEL_W, LABEL_H, 1]} raycast={() => null} />;
}
