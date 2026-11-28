/**
 * P3: the house's live listings as K3 product meshes on the interior display
 * slots. One InstancedMesh per display category; one empty group per listing
 * named `product_<listingId>` (the E2E and P4 click target) carrying the
 * runtime label "demo · display only". Display only: nothing here can order.
 *
 * P4: clicking a product reports its listing id through `onSelect` (the house
 * panel then shows a read-only card). Nothing here can order or pay.
 *
 * P3/P4: listings come in as the `house` prop from the same state the house
 * panel uses (no fetch of its own), so an owner's add, re-slot or deactivate
 * re-lays the room as soon as the panel reloads.
 *
 * Slots are in the interior template's frame (K2 variant-local); mount this
 * inside the group that holds that interior. NOT MOUNTED (see the P3 hand-off).
 */
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { houseDisplay, type HouseDisplaySource } from "../world/productSlotsHouse";
import { assignListingsToSlots, type DisplaySlot, type ProductLayout } from "../world/productSlots";
import { DISPLAY_LABEL, k3NodeName, parseK3, productInstances, type K3Kit, type ProductInstanceGroup } from "../world/productSlotsKit";

export const K3_DIR = "/kits/k3";
const LABEL_LIFT = 0.12;
const LABEL_SIZE: readonly [number, number] = [0.44, 0.07];
/** Invisible click target: drawn into neither colour nor depth, but still raycast. */
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

/** Loads and validates the K3 manifest once; null until loaded or after a failure (logged). */
export function useK3Kit(): K3Kit | null {
  const [kit, setKit] = useState<K3Kit | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${K3_DIR}/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`k3 manifest HTTP ${r.status}`))))
      .then((json) => live && setKit(parseK3(json)))
      .catch((error) => console.error("[ProductDisplays] K3 manifest unavailable; products not drawn", error));
    return () => {
      live = false;
    };
  }, []);
  return kit;
}

function labelTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(20, 16, 12, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3ead8";
  ctx.font = "500 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(DISPLAY_LABEL, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Meshes under the category node, each with its transform relative to that node. */
function categoryParts(scene: THREE.Object3D, productNode: string) {
  const found = scene.getObjectByName(k3NodeName(productNode)) ?? findByOriginalName(scene, productNode);
  if (!found) return [];
  found.updateWorldMatrix(true, true);
  const toNode = found.matrixWorld.clone().invert();
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
  found.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material, local: o === found ? new THREE.Matrix4() : toNode.clone().multiply(mesh.matrixWorld) });
  });
  return parts;
}

function findByOriginalName(scene: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let hit: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (!hit && o.userData?.name === name) hit = o;
  });
  return hit;
}

function CategoryInstances({ group, kit }: { readonly group: ProductInstanceGroup; readonly kit: K3Kit }) {
  const { scene } = useGLTF(`${K3_DIR}/${kit.glb}`);
  const meshes = useMemo(() => {
    const parts = categoryParts(scene, group.productNode);
    if (!parts.length) console.error(`[ProductDisplays] K3 node ${group.productNode} missing`);
    const at = new THREE.Matrix4();
    return parts.map(({ geometry, material, local }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, group.items.length);
      group.items.forEach((item, i) => {
        at.compose(new THREE.Vector3(...item.position), new THREE.Quaternion(), new THREE.Vector3(item.scale, item.scale, item.scale));
        mesh.setMatrixAt(i, at.clone().multiply(local));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `products_${group.category}`;
      return mesh;
    });
  }, [scene, group]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/** A broken kit GLB loses the meshes only; the named product groups and labels stay. */
class KitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[ProductDisplays] K3 kit failed to load", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Select = ((listingId: string) => void) | undefined;

function clickTo(onSelect: Select, listingId: string) {
  if (!onSelect) return undefined;
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(listingId);
  };
}

function ProductMarkers({ groups, kit, label, onSelect }: { readonly groups: readonly ProductInstanceGroup[]; readonly kit: K3Kit; readonly label: THREE.Texture | null; readonly onSelect: Select }) {
  return (
    <>
      {groups.flatMap((g) =>
        g.items.map((item, i) => {
          const [w, d, h] = kit.byId(g.category).productSize.map((v) => v * item.scale);
          return (
            <group key={item.listingId} name={`product_${item.listingId}`} position={item.position as [number, number, number]} userData={{ listingId: item.listingId, category: g.category, instance: i, displayOnly: true }}>
              {onSelect && (
                <mesh name={`product_hit_${item.listingId}`} position={[0, h / 2, 0]} material={HIT_MATERIAL} onClick={clickTo(onSelect, item.listingId)}>
                  <boxGeometry args={[w, h, d]} />
                </mesh>
              )}
              {label && (
                <sprite position={[0, h + LABEL_LIFT, 0]} scale={[LABEL_SIZE[0], LABEL_SIZE[1], 1]}>
                  <spriteMaterial map={label} transparent depthWrite={false} />
                </sprite>
              )}
            </group>
          );
        }),
      )}
    </>
  );
}

/** DEV only: the placed ids, and `select` that runs the same handler a product click does (for E2E). */
function exposeForTests(propertyId: string, layout: ProductLayout, onSelect: Select) {
  if (!import.meta.env.DEV) return;
  const placed = layout.placed.map((p) => p.listingId);
  (window as unknown as Record<string, unknown>).__nervixProducts = Object.freeze({
    propertyId,
    placed,
    overflow: layout.overflow.map((p) => p.listingId),
    select: (listingId: string) => {
      if (!onSelect || !placed.includes(listingId)) return false;
      onSelect(listingId);
      return true;
    },
  });
}

export interface ProductDisplaysProps {
  /**
   * The house the interior panel holds (InteriorCatalog `onHouse`; it is re-sent
   * after every owner save), so 3D and 2D show one snapshot. null until loaded.
   */
  readonly house: HouseDisplaySource | null;
  readonly slots: readonly DisplaySlot[];
  /** Called with each new layout, e.g. so a 2D list can show the overflow. */
  readonly onLayout?: (layout: ProductLayout) => void;
  /** P4: a product was clicked; opens the read-only card. No checkout path. */
  readonly onSelect?: (listingId: string) => void;
}

export function ProductDisplays({ house, slots, onLayout, onSelect }: ProductDisplaysProps) {
  const kit = useK3Kit();
  const display = useMemo(() => houseDisplay(house), [house]);
  const propertyId = display?.propertyId ?? "";
  const label = useMemo(() => labelTexture(), []);
  useEffect(() => () => label?.dispose(), [label]);
  const layout = useMemo(
    () => (kit && display ? assignListingsToSlots(display.listings, slots, { featuredIds: display.featuredIds, categories: kit.categoryIds }) : null),
    [kit, display, slots],
  );
  const groups = useMemo(() => (kit && layout ? productInstances(layout, kit) : []), [kit, layout]);
  useEffect(() => {
    if (!layout) return;
    exposeForTests(propertyId, layout, onSelect);
    onLayout?.(layout);
  }, [propertyId, layout, onLayout, onSelect]);
  if (!kit || !layout) return null;
  return (
    <group name="product_displays" userData={{ propertyId }}>
      <ProductMarkers groups={groups} kit={kit} label={label} onSelect={onSelect} />
      <KitBoundary>
        <Suspense fallback={null}>
          {groups.map((g) => (
            <CategoryInstances key={g.category} group={g} kit={kit} />
          ))}
        </Suspense>
      </KitBoundary>
    </group>
  );
}
