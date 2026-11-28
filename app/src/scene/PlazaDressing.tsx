import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Warm patterned paving, drawn once into a canvas texture. */
function usePavingTexture() {
  return useMemo(() => {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9c7a6";
    g.fillRect(0, 0, size, size);
    const rows = 8;
    const h = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (h / 2);
      for (let x = -h; x < size + h; x += h) {
        const shade = 198 + ((r * 7 + x * 3) % 26);
        g.fillStyle = `rgb(${shade + 20},${shade + 6},${shade - 22})`;
        g.fillRect(x + offset + 2, r * h + 2, h - 4, h - 4);
        g.strokeStyle = "rgba(120,96,66,0.35)";
        g.lineWidth = 2;
        g.strokeRect(x + offset + 2, r * h + 2, h - 4, h - 4);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.anisotropy = 4;
    return tex;
  }, []);
}

/** Blue water surface plus animated jets in the fountain bowl. */
function FountainWater() {
  const jets = useRef<THREE.Group>(null);
  const water = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (water.current) {
      const m = water.current.material as THREE.MeshStandardMaterial;
      m.opacity = 0.72 + Math.sin(t * 1.6) * 0.06;
    }
    if (jets.current) {
      jets.current.children.forEach((child, i) => {
        const s = 0.85 + Math.sin(t * 3 + i) * 0.15;
        child.scale.y = s;
      });
    }
  });

  return (
    <group>
      <mesh ref={water} position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.25, 40]} />
        <meshStandardMaterial
          color="#2f7fb5"
          transparent
          opacity={0.75}
          roughness={0.15}
          metalness={0.1}
        />
      </mesh>
      <group ref={jets}>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.1, 1.55, Math.sin(a) * 1.1]}>
              <cylinderGeometry args={[0.035, 0.06, 1.3, 6]} />
              <meshStandardMaterial color="#bfe6f5" transparent opacity={0.85} roughness={0.1} />
            </mesh>
          );
        })}
        <mesh position={[0, 2.1, 0]}>
          <cylinderGeometry args={[0.05, 0.09, 1.8, 8]} />
          <meshStandardMaterial color="#d8f2fb" transparent opacity={0.9} roughness={0.1} />
        </mesh>
      </group>
    </group>
  );
}

/** Stone planters with leafy foliage and small clustered petals. */
function Planters() {
  const spots = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return [Math.cos(a) * 7.6, Math.sin(a) * 7.6] as const;
      }),
    [],
  );
  const petals = ["#b5486b", "#d9a441", "#e8e1d0", "#8e5aa8"];
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.62, 0.5, 0.64, 12]} />
            <meshStandardMaterial color="#c9a27a" roughness={0.9} />
          </mesh>
          {/* leafy foliage */}
          {Array.from({ length: 7 }, (_, j) => {
            const a = (j / 7) * Math.PI * 2;
            return (
              <mesh
                key={`leaf${j}`}
                position={[Math.cos(a) * 0.26, 0.74 + (j % 3) * 0.06, Math.sin(a) * 0.26]}
                scale={[1, 0.55, 1]}
                castShadow
              >
                <sphereGeometry args={[0.2, 7, 5]} />
                <meshStandardMaterial color={j % 2 ? "#4f7a3a" : "#3f6b31"} roughness={0.95} />
              </mesh>
            );
          })}
          {/* small clustered petals */}
          {Array.from({ length: 3 }, (_, f) => {
            const a = (f / 3) * Math.PI * 2 + i;
            return (
              <group key={`f${f}`} position={[Math.cos(a) * 0.18, 0.9, Math.sin(a) * 0.18]}>
                {Array.from({ length: 4 }, (_, k) => {
                  const pa = (k / 4) * Math.PI * 2;
                  return (
                    <mesh key={k} position={[Math.cos(pa) * 0.05, 0, Math.sin(pa) * 0.05]} scale={[1, 0.6, 1]}>
                      <sphereGeometry args={[0.035, 6, 4]} />
                      <meshStandardMaterial color={petals[(i + f) % petals.length]} roughness={0.8} />
                    </mesh>
                  );
                })}
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

export function PlazaDressing() {
  const paving = usePavingTexture();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial map={paving} roughness={0.95} />
      </mesh>
      <FountainWater />
      <Planters />
    </group>
  );
}