/**
 * B4: one K2 house per occupied plot. The variant is chosen deterministically
 * from propertyId + the plot size class, the house is placed so its door
 * anchor sits on the plot threshold, and the blank sign surface gets a canvas
 * texture painted from the merchant record at runtime (identity is never baked).
 *
 * NOT MOUNTED. The scene wave mounts <MerchantHouses> (see the B4 hand-off).
 */
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { WorldHouse } from "../net/api/world";
import type { SlicePlot } from "../world/houseDirectory";
import { parseK2, placeHouse, selectVariant, type K2Kit, type K2Variant } from "../world/interiorTemplate";
import { paintSignboard, signboardSpec } from "../world/signboard";
import { housesOnPlots, merchantHouseName } from "../world/merchantHousePlan";
import { k2OptionVisible, SIGN_BOARD_MATERIAL, signSurfaceMeshes } from "../world/signboardSurface";

export const K2_DIR = "/kits/k2";

/** Loads and validates the K2 manifest once; null until loaded or after a failure (logged). */
export function useK2Kit(): K2Kit | null {
  const [kit, setKit] = useState<K2Kit | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${K2_DIR}/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`k2 manifest HTTP ${r.status}`))))
      .then((json) => live && setKit(parseK2(json)))
      .catch((error) => console.error("[MerchantHouse] K2 manifest unavailable; houses not drawn", error));
    return () => {
      live = false;
    };
  }, []);
  return kit;
}

function signTexture(house: WorldHouse, variant: K2Variant): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  const spec = signboardSpec(house, { size: variant.sign.size });
  if (!paintSignboard(canvas, spec)) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Clones the kit scene for this house, shows K2 options at their defaults and
 * paints the sign: only the board primitive(s) of the sign node get the
 * texture (signSurfaceMeshes), the wood frame keeps its material. A missing
 * board is logged, never silent.
 */
function dressHouse(scene: THREE.Object3D, variant: K2Variant, texture: THREE.Texture | null) {
  const root = scene.clone(true);
  root.traverse((obj) => {
    const visible = k2OptionVisible(obj.userData);
    if (visible !== undefined) obj.visible = visible;
  });
  if (!texture) return { root, created: [] as THREE.Material[] };
  const boards = signSurfaceMeshes(root, variant.sign.surfaceNode) as unknown as readonly THREE.Mesh[];
  if (!boards.length) console.error(`[MerchantHouse] ${variant.id}: no ${SIGN_BOARD_MATERIAL} mesh under ${variant.sign.surfaceNode}; sign left blank`);
  const created = boards.map((mesh) => {
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0 });
    mesh.material = material;
    return material;
  });
  return { root, created };
}

/** DEV only (E2E): what each mounted house drew; `signMeshes` must be 1 for a painted K2 sign. */
interface HouseReport {
  readonly propertyId: string;
  readonly variant: string;
  readonly plotId: string;
  readonly signMeshes: number;
}

let houseReports: Readonly<Record<string, HouseReport>> = Object.freeze({});

function publishReports(next: Readonly<Record<string, HouseReport>>) {
  houseReports = Object.freeze(next);
  (window as unknown as Record<string, unknown>).__nervixHouses = houseReports;
}

function reportHouse(report: HouseReport): (() => void) | undefined {
  if (!import.meta.env.DEV) return undefined;
  publishReports({ ...houseReports, [report.propertyId]: Object.freeze(report) });
  return () => {
    const { [report.propertyId]: _gone, ...rest } = houseReports;
    publishReports(rest);
  };
}

interface HouseProps {
  readonly house: WorldHouse;
  readonly plot: SlicePlot;
  readonly kit: K2Kit;
}

function HouseModel({ house, plot, kit }: HouseProps) {
  const variant = useMemo(() => selectVariant(kit, house.propertyId, plot.sizeClass), [kit, house.propertyId, plot.sizeClass]);
  const { scene } = useGLTF(`${K2_DIR}/${variant.file}`);
  const texture = useMemo(() => signTexture(house, variant), [house, variant]);
  const dressed = useMemo(() => dressHouse(scene, variant, texture), [scene, variant, texture]);
  const pose = useMemo(() => placeHouse(plot, variant), [plot, variant]);

  useEffect(() => () => {
    dressed.created.forEach((m) => m.dispose());
    texture?.dispose();
  }, [dressed, texture]);
  useEffect(
    () => reportHouse({ propertyId: house.propertyId, variant: variant.id, plotId: plot.id, signMeshes: dressed.created.length }),
    [house.propertyId, variant.id, plot.id, dressed],
  );

  return (
    <group name={merchantHouseName(house.propertyId)} position={pose.position as [number, number, number]} rotation={[0, pose.yaw, 0]} userData={{ variant: variant.id, plotId: plot.id }}>
      <primitive object={dressed.root} />
    </group>
  );
}

/** A broken house GLB loses only that house, never the street. */
class HouseBoundary extends Component<{ children: ReactNode; propertyId: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`[MerchantHouse] ${this.props.propertyId} failed to load`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MerchantHouse(props: HouseProps) {
  return (
    <HouseBoundary propertyId={props.house.propertyId}>
      <Suspense fallback={null}>
        <HouseModel {...props} />
      </Suspense>
    </HouseBoundary>
  );
}

interface HousesProps {
  readonly houses: readonly WorldHouse[];
  readonly plots: readonly SlicePlot[];
  /** Plots already modelled in the Blender scene; never drawn twice. */
  readonly builtPlotIds?: ReadonlySet<string>;
}

/** One house per listed house whose plot is in the manifest and not already built; empty plots draw nothing. */
export function MerchantHouses({ houses, plots, builtPlotIds }: HousesProps) {
  const kit = useK2Kit();
  const pairs = useMemo(() => housesOnPlots(houses, plots, builtPlotIds), [houses, plots, builtPlotIds]);
  if (!kit) return null;
  return (
    <group name="merchant_houses">
      {pairs.map(({ house, plot }) => (
        <MerchantHouse key={house.propertyId} house={house} plot={plot} kit={kit} />
      ))}
    </group>
  );
}
