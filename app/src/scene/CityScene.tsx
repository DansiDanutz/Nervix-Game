import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { applyPlacement, placeMarker } from "./placement";

export interface Marker {
  id: string;
  kind: string | null;
  slot: string | null;
  position: [number, number, number];
}

interface Asset {
  id: string;
  file: string;
  bytes: number;
}

interface Manifest {
  schema_version: number;
  district: string;
  assets: Asset[];
  markers: Marker[];
}

const MANIFEST_URL = "/manifest.json";

export function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(MANIFEST_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: Manifest) => alive && setManifest(m))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, []);

  return { manifest, missing };
}

function AssetModel({ file }: { file: string }) {
  const { scene } = useGLTF(file);
  applyPlacement(scene);
  return <primitive object={scene} />;
}

/** Explicit temporary blockout. Replaced by the Blender district export. */
function Blockout() {
  const stone = useMemo(() => ({ color: "#e8dcc0", roughness: 0.85 }), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial {...stone} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[2.2, 2.4, 1.2, 24]} />
        <meshStandardMaterial color="#d9d2c4" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 1.6, 12]} />
        <meshStandardMaterial color="#cfc6b4" />
      </mesh>
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 1.5, -6]} castShadow>
          <boxGeometry args={[4, 3, 4]} />
          <meshStandardMaterial color="#e0cba8" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export type SceneMode = "chunks" | "full";

/** Never render the district and its chunks together. */
export function pickAssets(manifest: Manifest | null, mode: SceneMode) {
  if (!manifest || manifest.assets.length === 0) return [];
  const full = manifest.assets.find((a) => a.id === manifest.district);
  const chunks = manifest.assets.filter((a) => a.id !== manifest.district);
  if (mode === "full") return full ? [full] : chunks;
  return chunks.length > 0 ? chunks : full ? [full] : [];
}

export function CityScene({
  onMarkers,
  mode = "chunks",
  hide = [],
  blockout = true,
}: {
  onMarkers: (m: Marker[]) => void;
  mode?: SceneMode;
  hide?: string[];
  /** false when another export (the arrival square) owns the ground: never draw the blockout over it. */
  blockout?: boolean;
}) {
  const { manifest, missing } = useManifest();
  // A chunk replaced by a newer Blender export (e.g. the OpenPoker facade) is hidden, never both drawn.
  const available = pickAssets(manifest, hide.length ? "chunks" : mode);
  const assets = available.filter((a) => !hide.includes(a.id));

  useEffect(() => {
    const placed = (manifest?.markers ?? []).map((m) => ({
      ...m,
      position: placeMarker(m.position, m.id),
    }));
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixMarkers = placed;
    onMarkers(placed);
  }, [manifest, onMarkers]);

  // The blockout stands in only for a missing export; chunks hidden on purpose leave nothing behind.
  if (missing || !manifest || available.length === 0) {
    return blockout ? (
      <group>
        <Blockout />
      </group>
    ) : null;
  }

  return (
    <group>
      <Suspense fallback={null}>
        {assets.map((a) => (
          <AssetModel key={a.id} file={`/${a.file}`} />
        ))}
      </Suspense>
    </group>
  );
}
