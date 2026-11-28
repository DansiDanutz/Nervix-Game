/**
 * Arrival material pass, run once over the lit clone of the arrival GLB:
 * - baked lighting (bakedLighting.ts): KHR_materials_unlit meshes stay MeshBasicMaterial; lightmap
 *   meshes get `lightMap` on uv1 (non-metals drawn unlit as albedo x lightmap, metals keep PBR);
 * - fountain water (fountainWater.ts): pool, jet and splash meshes get the animated shaders;
 * - surface detail (bakedDetail.ts, GPU tier): lightmapped stone, paving, roofs, cloth and pots keep
 *   their exported normal maps as relief over the bake, plus macro variation and a ceramic glaze.
 * Source materials are never mutated: replacements are new materials owned by the caller.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  LIGHTMAP_METAL_THRESHOLD, LIGHTMAP_SLOTS, bakeMode, bakedFraction, brokenLightmap, emissionColor, isSkyCard, lightmapEncoding, lightmapFlag, lightmapIntensity, pickLightmapSlot,
  type BakeMode, type LightmapEncoding, type LightmapSlot,
} from "./bakedLighting";
import { waterKind } from "./fountainWater";
import { waterMaterial, type WaterContext } from "./waterMaterials";
import { surfaceDetail } from "./bakedDetail";
import { detailShared, withBakedDetail, type DetailShared } from "./bakedDetailShader";

/**
 * three's MeshBasic and MeshStandard both scale lightmap texels by 1/PI (physically based
 * irradiance); the contract's lightmap holds "lighting" where 1 leaves the albedo unchanged.
 */
const LIGHTMAP_TO_IRRADIANCE = Math.PI;

/** First material seen per mesh, so a re-run (StrictMode, dependency change) starts from the export. */
const ORIGINAL = new WeakMap<THREE.Mesh, THREE.Material>();

type Slots = Partial<Record<LightmapSlot, THREE.Texture | null>>;

function ancestry(o: THREE.Object3D): THREE.Object3D[] {
  const chain: THREE.Object3D[] = [];
  for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) chain.push(cur);
  return chain;
}

function slotsOf(m: THREE.Material): Slots {
  const s = m as THREE.MeshStandardMaterial;
  return { lightMap: s.lightMap ?? null, aoMap: s.aoMap ?? null, emissiveMap: s.emissiveMap ?? null };
}

/** One re-tagged copy per source texture and colour space, shared by every material using it. */
const DECODED = new WeakMap<THREE.Texture, Map<string, THREE.Texture>>();

/** `tex` tagged with the colour space its texels are encoded in (never mutates `tex`). */
function decodedAs(tex: THREE.Texture, encoding: LightmapEncoding): THREE.Texture {
  const space = encoding === "srgb" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  if (tex.colorSpace === space || (encoding === "linear" && tex.colorSpace === THREE.NoColorSpace)) return tex;
  const byspace = DECODED.get(tex) ?? new Map<string, THREE.Texture>();
  DECODED.set(tex, byspace);
  const hit = byspace.get(space);
  if (hit) return hit;
  const copy = tex.clone();
  copy.colorSpace = space;
  copy.needsUpdate = true;
  byspace.set(space, copy);
  return copy;
}

/** A lightmapped copy of `src`; the slot that carried the lightmap is cleared on the copy. */
function lightmapped(src: THREE.MeshStandardMaterial, slot: LightmapSlot, intensity: number, encoding: LightmapEncoding, detail: DetailShared | null): THREE.Material {
  const map = decodedAs(slotsOf(src)[slot]!, encoding);
  const lightMapIntensity = intensity * LIGHTMAP_TO_IRRADIANCE;
  if (src.metalness >= LIGHTMAP_METAL_THRESHOLD) {
    const copy = src.clone();
    copy.lightMap = map;
    copy.lightMapIntensity = lightMapIntensity;
    if (slot === "aoMap") copy.aoMap = null;
    if (slot === "emissiveMap") {
      copy.emissiveMap = null;
      copy.emissive = new THREE.Color(0x000000);
    }
    return copy;
  }
  const basic = new THREE.MeshBasicMaterial({
    name: `${src.name}#baked`,
    color: src.color.clone(),
    map: src.map,
    alphaMap: src.alphaMap,
    lightMap: map,
    lightMapIntensity,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    vertexColors: src.vertexColors,
  });
  const look = detail && surfaceDetail(src.name);
  return look ? withBakedDetail(basic, look, detail, src.normalMap, src.normalScale) : basic;
}

/** A cloud card drawn as its Blender emission: unlit, unfogged, no shadows. */
function skyCard(src: THREE.MeshStandardMaterial): THREE.Material {
  const [r, g, b] = emissionColor([src.emissive.r, src.emissive.g, src.emissive.b], src.emissiveIntensity);
  return new THREE.MeshBasicMaterial({
    name: `${src.name}#sky`,
    color: new THREE.Color().setRGB(r, g, b),
    transparent: src.transparent,
    opacity: src.opacity,
    side: src.side,
    fog: false,
  });
}

export interface ArrivalMaterialStats {
  meshes: number;
  /** Cloud cards drawn as emission (isSkyCard). */
  sky: number;
  baked: Record<BakeMode, number>;
  water: number;
  /** Lightmapped materials that carry the surface-detail shader. */
  detailed: number;
  /** Mesh names whose lightmap flag could not be honoured (no uv1 or no uv1 texture). */
  broken: string[];
  bakedFraction: number;
}

interface Pass {
  stats: ArrivalMaterialStats;
  created: THREE.Material[];
}

function applyPass(root: THREE.Object3D, ctx: WaterContext, detail: DetailShared | null): Pass {
  const created: THREE.Material[] = [];
  const cache = new Map<string, THREE.Material>();
  const stats: ArrivalMaterialStats = { meshes: 0, sky: 0, baked: { unlit: 0, lightmap: 0, lit: 0 }, water: 0, detailed: 0, broken: [], bakedFraction: 0 };

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    stats.meshes += 1;
    const src = ORIGINAL.get(mesh) ?? mesh.material;
    ORIGINAL.set(mesh, src);
    const chain = ancestry(mesh);
    const kind = waterKind(chain.map((c) => c.name), src.name);
    if (kind) {
      const key = `water:${kind}:${src.uuid}`;
      const water = cache.get(key) ?? waterMaterial(kind, ctx, src.name);
      if (!cache.has(key)) {
        cache.set(key, water);
        created.push(water);
      }
      mesh.material = water;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      stats.water += 1;
      return;
    }

    if (isSkyCard(src.name) && (src as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      const key = `sky:${src.uuid}`;
      const card = cache.get(key) ?? skyCard(src as THREE.MeshStandardMaterial);
      if (!cache.has(key)) {
        cache.set(key, card);
        created.push(card);
      }
      mesh.material = card;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      stats.sky += 1;
      return;
    }

    const userData = [src.userData, ...chain.map((c) => c.userData)];
    const slots = slotsOf(src);
    const slot = pickLightmapSlot(slots);
    const probe = {
      basic: (src as THREE.MeshBasicMaterial).isMeshBasicMaterial === true,
      lightmapFlag: lightmapFlag(...userData),
      hasUv1: !!mesh.geometry.getAttribute("uv1"),
      hasLightmapTexture: slot !== null,
    };
    const mode = bakeMode(probe);
    stats.baked[mode] += 1;
    if (brokenLightmap(probe)) stats.broken.push(mesh.name);
    if (mode === "unlit") {
      // Lighting already lives in the colour; never shaded or shadowed again.
      mesh.receiveShadow = false;
      return;
    }
    if (mode !== "lightmap" || !slot) return;
    const std = src as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial) return;
    const key = `lightmap:${src.uuid}:${slot}`;
    const baked = cache.get(key) ?? lightmapped(std, slot, lightmapIntensity(...userData), lightmapEncoding(slot, ...userData), detail);
    if (!cache.has(key)) {
      cache.set(key, baked);
      created.push(baked);
      if (baked.defines && Object.keys(baked.defines).some((d) => d.startsWith("DETAIL_"))) stats.detailed += 1;
    }
    mesh.material = baked;
    // Unlit lightmapped surfaces already hold Cycles shadows; metals keep runtime shadowed glints.
    mesh.receiveShadow = !(baked as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  });

  stats.bakedFraction = bakedFraction({ baked: stats.baked.unlit + stats.baked.lightmap, total: stats.meshes - stats.water - stats.sky });
  return { stats, created };
}

/**
 * Runs the pass over `root` (a clone this component owns), drives the water clock, and disposes
 * the materials it created on unmount. The stats land on `root.userData.arrivalMaterials` for the
 * AO composer and DEV probes.
 */
export function useArrivalMaterials(root: THREE.Object3D, ctx: Omit<WaterContext, "time"> & { detail?: boolean }) {
  const time = useMemo(() => ({ value: 0 }), []);
  const [cx, cz] = ctx.center;
  const [sx, sy, sz] = ctx.sunDirection;
  const withDetail = ctx.detail ?? false;
  const pass = useMemo(
    () =>
      applyPass(
        root,
        { time, center: [cx, cz], sky: ctx.sky, sunDirection: [sx, sy, sz], sunColor: ctx.sunColor },
        withDetail ? detailShared([sx, sy, sz], ctx.sunColor, ctx.sky) : null,
      ),
    [root, time, cx, cz, ctx.sky, sx, sy, sz, ctx.sunColor, withDetail],
  );
  useEffect(() => {
    root.userData = { ...root.userData, arrivalMaterials: pass.stats };
    if (pass.stats.broken.length) {
      console.warn(`[arrival] lightmap requested without uv1 or a uv1 texture (${LIGHTMAP_SLOTS.join("/")}): ${pass.stats.broken.join(", ")}`);
    }
    return () => {
      for (const m of pass.created) m.dispose();
    };
  }, [root, pass]);
  useFrame((_, delta) => {
    time.value += delta;
  });
  return pass.stats;
}
