import { useMemo } from "react";
import * as THREE from "three";

const TEAL = "#2f6f6a";
const PLUM = "#5b3a5e";
const GOLD = "#c9a441";
const TERRA = "#a4502f";
const CREAM = "#efe4cf";
const ROSE = "#d9a8a0";

function stripedTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#f2ead8" : TEAL;
    g.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** Concentric rose-and-cream paving rings around the fountain. */
function Rings() {
  return (
    <group>
      {([
        [3.4, ROSE],
        [4.3, CREAM],
        [5.2, ROSE],
        [6.1, CREAM],
      ] as [number, string][]).map(([r, colour], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02 + i * 0.002, 0]} receiveShadow>
          <ringGeometry args={[r - 0.45, r, 48]} />
          <meshStandardMaterial color={colour} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Arched teal door, three shuttered windows, flower boxes, gable and chimney. */
function HouseFacade() {
  return (
    <group position={[-2.5, 0, -3.08]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.5, 2.4, 0.14]} />
        <meshStandardMaterial color={TEAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.14, 20, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={TEAL} roughness={0.6} />
      </mesh>
      {[-2.1, 0, 2.1].map((x) => (
        <group key={x} position={[x, 4.4, 0]}>
          <mesh>
            <boxGeometry args={[1.0, 2.0, 0.1]} />
            <meshStandardMaterial color="#3b2a1e" roughness={0.7} />
          </mesh>
          {[-0.62, 0.62].map((sx) => (
            <mesh key={sx} position={[sx, 0, 0.06]}>
              <boxGeometry args={[0.22, 2.0, 0.08]} />
              <meshStandardMaterial color={TEAL} roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0, -1.15, 0.12]}>
            <boxGeometry args={[1.1, 0.28, 0.24]} />
            <meshStandardMaterial color="#8a5a3b" roughness={0.9} />
          </mesh>
          {[-0.3, 0, 0.3].map((fx, i) => (
            <mesh key={i} position={[fx, -0.98, 0.2]}>
              <sphereGeometry args={[0.09, 6, 5]} />
              <meshStandardMaterial color={i % 2 ? "#d9a441" : "#b5486b"} />
            </mesh>
          ))}
        </group>
      ))}
      {/* tiled gable + chimney */}
      <mesh position={[0, 6.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.3, 1.5, 4]} />
        <meshStandardMaterial color={TERRA} roughness={0.9} />
      </mesh>
      <mesh position={[1.9, 7.3, -0.1]} castShadow>
        <boxGeometry args={[0.6, 1.3, 0.6]} />
        <meshStandardMaterial color="#b06a4a" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Striped canopy, walk-in entrance and pavement tables. */
function CafeFront() {
  const stripes = useMemo(stripedTexture, []);
  return (
    <group position={[-9.5, 0, -3.1]}>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[1.6, 2.2, 0.14]} />
        <meshStandardMaterial color="#2a1a12" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.05, 1.1]} rotation={[0.16, 0, 0]} castShadow>
        <boxGeometry args={[6.6, 2.2, 0.1]} />
        <meshStandardMaterial map={stripes} roughness={0.85} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={`scallop${i}`} position={[-2.8 + i * 0.7, 2.35, 2.18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.06, 10, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color={TEAL} roughness={0.8} />
        </mesh>
      ))}
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} position={[x, 1.5, 2.0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
          <meshStandardMaterial color={TEAL} />
        </mesh>
      ))}
    </group>
  );
}

/** Broad steps, one centred spade and paired plum banners. */
function CasinoFront() {
  const spade = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.55);
    s.bezierCurveTo(0.5, 0.1, 0.42, -0.35, 0.12, -0.3);
    s.lineTo(0.12, -0.5);
    s.lineTo(-0.12, -0.5);
    s.lineTo(-0.12, -0.3);
    s.bezierCurveTo(-0.42, -0.35, -0.5, 0.1, 0, 0.55);
    return s;
  }, []);
  return (
    <group position={[9, 0, -8.3]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.09 + i * 0.18, i * 0.55]} receiveShadow castShadow>
          <boxGeometry args={[9.5, 0.18, 0.6]} />
          <meshStandardMaterial color={CREAM} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0.05]}>
        <boxGeometry args={[2.4, 3.4, 0.16]} />
        <meshStandardMaterial color={PLUM} roughness={0.7} />
      </mesh>
      <mesh position={[0, 4.6, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.16, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={PLUM} roughness={0.7} />
      </mesh>
      {[-1.22, 1.22].map((x) => (
        <mesh key={x} position={[x, 2.9, 0.16]}>
          <boxGeometry args={[0.12, 3.5, 0.12]} />
          <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 4.66, 0.16]}>
        <boxGeometry args={[2.6, 0.12, 0.12]} />
        <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 5.55, 0.12]}>
        <shapeGeometry args={[spade]} />
        <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={x} position={[x, 4.4, 0.1]}>
          <boxGeometry args={[0.9, 2.6, 0.08]} />
          <meshStandardMaterial color={PLUM} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Colonnade behind the fountain, plus a layered hill and aqueduct. */
function Depth() {
  return (
    <group>
      <group position={[0, 0, -6.9]}>
        {[-7, -4.2, -1.4, 1.4, 4.2, 7].map((x) => (
          <mesh key={x} position={[x, 2.0, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.32, 4.0, 10]} />
            <meshStandardMaterial color={CREAM} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 4.1, 0]} castShadow>
          <boxGeometry args={[15, 0.5, 0.8]} />
          <meshStandardMaterial color={CREAM} roughness={0.9} />
        </mesh>
      </group>
      {/* hills */}
      {[
        [-20, -34, 18, 4.2],
        [2, -38, 22, 5.0],
        [24, -33, 16, 3.8],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} position={[x, h / 2 - 1.6, z]} scale={[1, 0.32, 1]}>
          <sphereGeometry args={[r, 14, 8]} />
          <meshStandardMaterial color={i === 1 ? "#b9c3ab" : "#aeb9a0"} roughness={1} />
        </mesh>
      ))}
      {/* aqueduct */}
      <group position={[0, 0, -24]}>
        {[-8, -4, 0, 4, 8].map((x) => (
          <mesh key={x} position={[x, 1.7, 0]}>
            <boxGeometry args={[0.55, 3.4, 0.55]} />
            <meshStandardMaterial color="#cbb894" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, 3.4, 0]}>
          <boxGeometry args={[18, 0.5, 0.7]} />
          <meshStandardMaterial color="#cbb894" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

export function SetDressing() {
  return (
    <group>
      <Rings />
      <HouseFacade />
      <CafeFront />
      <CasinoFront />
      <Depth />
    </group>
  );
}