import { Html } from "@react-three/drei";
import * as THREE from "three";

export interface HouseDoor {
  id: string;
  propertyId: string;
  owner: string;
  label: string;
  position: [number, number, number];
  colour: string;
  trim: string;
}

/** Free-standing merchant doors. Labels show only the stable door label; owner identity loads inside. */
export function HouseDoors({ doors, onDoorClick }: { doors: HouseDoor[]; onDoorClick: (door: HouseDoor) => void }) {
  return (
    <group>
      {doors.map((d) => (
        <group key={d.id} position={d.position}>
          <mesh
            position={[0, 1.4, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onDoorClick(d);
            }}>
            <boxGeometry args={[2.0, 2.8, 0.2]} />
            <meshStandardMaterial color={d.colour} roughness={0.7} />
          </mesh>
          <mesh position={[0, 2.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.0, 1.0, 0.2, 20, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color={d.colour} roughness={0.7} />
          </mesh>
          {[-1.02, 1.02].map((x) => (
            <mesh key={x} position={[x, 1.5, 0.14]}>
              <boxGeometry args={[0.1, 2.9, 0.1]} />
              <meshStandardMaterial color={d.trim} roughness={0.35} metalness={0.5} />
            </mesh>
          ))}
          <Html position={[0, 3.9, 0]} center distanceFactor={10}>
            <div className="door-label">
              <strong>{d.label}</strong>
              <small>merchant house · E or click</small>
            </div>
          </Html>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} userData-house={d.id}>
            <circleGeometry args={[1.6, 20]} />
            <meshStandardMaterial color={d.trim} transparent opacity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const HOUSE_INTERIORS: Record<string, { colour: string; accent: string; blurb: string }> = {
  bld_dangg: { colour: "#2a1f2e", accent: "#c9a441", blurb: "A plum-and-gold salon with a single spade over the counter." },
  bld_test: { colour: "#1f2a33", accent: "#b5486b", blurb: "A bright teal workshop with a long test bench." },
};

export function interiorFor(id: string) {
  return HOUSE_INTERIORS[id] ?? { colour: "#26333d", accent: THREE.Color.NAMES.gold, blurb: "A merchant interior." };
}