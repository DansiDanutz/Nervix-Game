/**
 * Canvas-sprite name labels for the remote crowd (C6). Shown only where the frame plan says
 * (full detail, within ~15 m, capped), so far players never clutter the fountain sightline.
 * Names are drawn as canvas text, never as HTML. One texture per distinct name, shared.
 */
import * as THREE from "three";
import { AVATAR_HEIGHT } from "../player/avatarShape";
import type { CrowdPlan } from "../world/remoteCrowd";

const MAX_NAME = 24;
const CANVAS_W = 256;
const CANVAS_H = 64;
/** World size of a label (m) and its height above the head. */
const LABEL_W = 1.1;
const LABEL_H = LABEL_W * (CANVAS_H / CANVAS_W);
const LABEL_LIFT = 0.28;
/** Distinct label textures kept before unused ones are freed. */
const MATERIAL_CACHE = 64;

export const labelText = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim() || "Traveller";
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1)}…` : clean;
};

function drawLabel(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(28, 22, 18, 0.62)";
    ctx.beginPath();
    ctx.roundRect(4, 8, CANVAS_W - 8, CANVAS_H - 16, 22);
    ctx.fill();
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f4ead8";
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W - 24);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A pool of label sprites keyed by player id, with materials shared per name. */
export class CrowdLabels {
  private readonly sprites = new Map<string, THREE.Sprite>();
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  private readonly group: THREE.Group;

  constructor(group: THREE.Group) {
    this.group = group;
  }

  /** Frees textures of names no sprite uses any more, once the cache outgrows a full square. */
  private prune(): void {
    if (this.materials.size <= MATERIAL_CACHE) return;
    const used = new Set([...this.sprites.values()].map((s) => s.material));
    for (const [text, mat] of this.materials) {
      if (used.has(mat)) continue;
      mat.map?.dispose();
      mat.dispose();
      this.materials.delete(text);
    }
  }

  private materialFor(name: string): THREE.SpriteMaterial {
    const text = labelText(name);
    const known = this.materials.get(text);
    if (known) return known;
    const made = new THREE.SpriteMaterial({ map: drawLabel(text), transparent: true, depthWrite: false });
    this.materials.set(text, made);
    return made;
  }

  private spriteFor(id: string, name: string): THREE.Sprite {
    const mat = this.materialFor(name);
    const known = this.sprites.get(id);
    if (known) {
      if (known.material !== mat) known.material = mat;
      return known;
    }
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(LABEL_W, LABEL_H, 1);
    sprite.raycast = () => undefined;
    this.group.add(sprite);
    this.sprites.set(id, sprite);
    return sprite;
  }

  /** Shows the plan's labelled players and hides the rest; drops sprites of players who left. */
  update(plan: CrowdPlan): void {
    const present = new Set(plan.map((e) => e.id));
    for (const [id, sprite] of this.sprites) {
      if (present.has(id)) continue;
      this.group.remove(sprite);
      this.sprites.delete(id);
    }
    for (const e of plan) {
      if (!e.label) {
        const idle = this.sprites.get(e.id);
        if (idle) idle.visible = false;
        continue;
      }
      const sprite = this.spriteFor(e.id, e.name);
      sprite.position.set(e.x, AVATAR_HEIGHT + LABEL_LIFT, e.z);
      sprite.visible = true;
    }
    this.prune();
  }

  dispose(): void {
    for (const sprite of this.sprites.values()) this.group.remove(sprite);
    this.sprites.clear();
    for (const mat of this.materials.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.materials.clear();
  }
}
