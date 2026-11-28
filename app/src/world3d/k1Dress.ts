/**
 * Shared K1 kit access for every skinned figure (C7): one cached manifest load (world/k1KitCache)
 * and dressK1(), a skinned copy of the kit GLB dressed as a preset (part visibility and material
 * slot recolour from the manifest). SkinnedAvatar uses it; scene/Pedestrians.tsx (fidelity lane)
 * keeps its own copy until that lane switches to these exports, so the two cannot drift.
 */
import { useEffect, useState } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createK1KitLoader } from "../world/k1KitCache";
import { parseK1Kit, visiblePartNodes, type K1Kit } from "../world/locomotionKit";

export const K1_KIT_DIR = "/kits/k1";

/** Module-level: nine avatars mean one manifest fetch and one parse. */
export const loadK1Kit = createK1KitLoader(K1_KIT_DIR, (url) => fetch(url), parseK1Kit);

/** The parsed K1 kit once loaded, or null (also null, with a warning, when it is unavailable). */
export function useK1Kit(): K1Kit | null {
  const [kit, setKit] = useState<K1Kit | null>(null);
  useEffect(() => {
    let live = true;
    loadK1Kit()
      .then((k) => live && setKit(k))
      .catch((e: unknown) => console.warn(`[avatar] K1 kit unavailable: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, []);
  return kit;
}

export interface DressedK1 {
  readonly root: THREE.Object3D;
  /** Materials created for this copy; the caller disposes them on unmount. */
  readonly created: readonly THREE.Material[];
}

function recolourer(kit: K1Kit, presetId: string) {
  const palette = kit.presets.find((p) => p.id === presetId)?.palette ?? {};
  const slotByMaterial = new Map(Object.entries(kit.slots).map(([slot, name]) => [name, slot]));
  const recoloured = new Map<THREE.Material, THREE.Material>();
  const recolour = (m: THREE.Material): THREE.Material => {
    const hex = palette[slotByMaterial.get(m.name) ?? ""];
    const std = m as THREE.MeshStandardMaterial;
    if (!hex || !std.isMeshStandardMaterial) return m;
    const known = recoloured.get(m);
    if (known) return known;
    const copy = std.clone();
    copy.color = new THREE.Color(hex);
    recoloured.set(m, copy);
    return copy;
  };
  return { recolour, created: () => [...recoloured.values()] };
}

/** A skinned copy of the kit scene dressed as `presetId`. The source scene is never modified. */
export function dressK1(scene: THREE.Object3D, kit: K1Kit, presetId: string): DressedK1 {
  const root = cloneSkinned(scene);
  const show = visiblePartNodes(kit, presetId);
  const partNodes = new Set(kit.parts.map((p) => p.node));
  const { recolour, created } = recolourer(kit, presetId);
  root.traverse((o) => {
    if (partNodes.has(o.name)) o.visible = show.has(o.name);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // skinned bounds follow the bind pose, not the animation
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
  });
  return Object.freeze({ root, created: Object.freeze(created()) });
}
