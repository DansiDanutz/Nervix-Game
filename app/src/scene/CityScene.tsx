import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";

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

export function CityScene({ onMarkers }: { onMarkers: (m: Marker[]) => void }) {
  const { manifest, missing } = useManifest();

  useEffect(() => {
    onMarkers(manifest?.markers ?? []);
  }, [manifest, onMarkers]);

  if (missing || !manifest || manifest.assets.length === 0) {
    return (
      <group>
        <Blockout />
      </group>
    );
  }

  return (
    <group>
      <Suspense fallback={null}>
        {manifest.assets.map((a) => (
          <AssetModel key={a.id} file={`/${a.file}`} />
        ))}
      </Suspense>
    </group>
  );
}

useGLTF.preload("/nervix_city_district_01.glb");