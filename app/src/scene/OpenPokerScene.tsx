import { useMemo } from "react";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Anchor } from "./slice";

export const SALON_GLB = "/slice/nervix_openpoker_salon.glb";
export const FACADE_GLB = "/slice/nervix_openpoker_facade.glb";

function useShadowed(url: string) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return root;
  }, [scene]);
}

/** A17 salon from Blender. Lighting approximates the Blender render: warm sun from the left windows. */
export function SalonScene({ exit, danggDoor }: { exit: Anchor; danggDoor: Anchor }) {
  const root = useShadowed(SALON_GLB);
  return (
    <group name="openpoker_salon">
      <primitive object={root} />
      <ambientLight intensity={0.35} color="#ffdcb0" />
      <directionalLight position={[-12, 9, 2]} intensity={2.4} color="#ffc98a" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-4, 3, 4]} intensity={6} distance={9} color="#ffb766" />
      <pointLight position={[4, 3, -2]} intensity={6} distance={9} color="#ffb766" />
      <Html position={[danggDoor.x, 3.1, danggDoor.z]} center distanceFactor={9}>
        <div className="door-label" data-testid="label-dangg-door">
          <strong>DanGG</strong>
          <small>merchant house · E or click</small>
        </div>
      </Html>
      <Html position={[exit.x, 2.6, exit.z]} center distanceFactor={9}>
        <div className="door-label">
          <strong>Plaza</strong>
          <small>exit</small>
        </div>
      </Html>
    </group>
  );
}

/** A16 facade from Blender, drawn exactly where Blender placed it (district frame). */
export function FacadeModel({ door, onClickDoor }: { door: Anchor; onClickDoor: () => void }) {
  const root = useShadowed(FACADE_GLB);
  return (
    <group name="openpoker_facade">
      <primitive object={root} />
      <mesh
        position={[door.x, 1.4, door.z]}
        onClick={(e) => {
          e.stopPropagation();
          onClickDoor();
        }}
        userData-door="openpoker">
        <boxGeometry args={[2.4, 2.8, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[door.x, 4.2, door.z]} center distanceFactor={11}>
        <div className="door-label" data-testid="label-openpoker">
          <strong>OpenPoker</strong>
          <small>open platform venue · E or click</small>
        </div>
      </Html>
    </group>
  );
}

useGLTF.preload(SALON_GLB);
useGLTF.preload(FACADE_GLB);
