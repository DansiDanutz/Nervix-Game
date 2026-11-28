import { useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { interiorFor, type HouseDoor } from "./HouseDoors";

const ROOM = { w: 12, d: 9, h: 4.2 };

/** A physical walk-in room with its own floor, walls, door and furnishings. */
export function InteriorRoom({ door }: { door: HouseDoor }) {
  const look = interiorFor(door.id);
  const [nearExit, setNearExit] = useState(false);

  useFrame(({ scene }) => {
    const player = scene.getObjectByName("player");
    if (!player) return;
    const d = Math.hypot(player.position.x, player.position.z - (-ROOM.d / 2 + 0.6));
    setNearExit(d < 2.4);
  });

  const isDangg = door.id === "bld_dangg";

  return (
    <group name="nervix_interior">
      {/* floor + ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color={isDangg ? "#3a2a3f" : "#24313a"} roughness={0.9} />
      </mesh>

      {/* walls */}
      {[
        [0, ROOM.h / 2, -ROOM.d / 2, ROOM.w, 0.2],
        [0, ROOM.h / 2, ROOM.d / 2, ROOM.w, 0.2],
        [-ROOM.w / 2, ROOM.h / 2, 0, 0.2, ROOM.d],
        [ROOM.w / 2, ROOM.h / 2, 0, 0.2, ROOM.d],
      ].map(([x, y, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[w, ROOM.h, d]} />
          <meshStandardMaterial color={isDangg ? "#4a3550" : "#2f3f49"} roughness={0.95} />
        </mesh>
      ))}
      {/* exit door on the far wall */}
      <mesh position={[0, 1.2, -ROOM.d / 2 + 0.15]}>
        <boxGeometry args={[1.8, 2.4, 0.12]} />
        <meshStandardMaterial color={look.accent} roughness={0.6} />
      </mesh>
      <Html position={[0, 3.0, -ROOM.d / 2 + 0.3]} center distanceFactor={9}>
        <div className="door-label">
          <strong>Exit to plaza</strong>
          <small>{nearExit ? "press E" : "walk here"}</small>
        </div>
      </Html>

      {/* furnishings differ per house */}
      {isDangg ? (
        <group>
          {/* clear central stone aisle toward the stairs */}
          <mesh position={[0, 0.015, -0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[2.4, 6.2]} />
            <meshStandardMaterial color="#cfc6b4" roughness={0.9} />
          </mesh>
          {/* curved walnut reception, left */}
          <mesh position={[-3.4, 0.55, 0.4]} rotation={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[1.5, 1.5, 1.1, 24, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#6b4423" roughness={0.55} />
          </mesh>
          <mesh position={[-3.4, 1.14, 0.4]} rotation={[0, 0.5, 0]}>
            <cylinderGeometry args={[1.55, 1.55, 0.08, 24, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#c9a441" roughness={0.35} metalness={0.45} />
          </mesh>
          {/* roulette table: stout pedestal, broad walnut rim, recessed wheel, brass spindle */}
          <mesh position={[-2.2, 0.45, -1.6]} castShadow>
            <cylinderGeometry args={[0.42, 0.55, 0.9, 16]} />
            <meshStandardMaterial color="#3a2a1e" roughness={0.75} />
          </mesh>
          <mesh position={[-2.2, 0.95, -1.6]} castShadow>
            <cylinderGeometry args={[1.05, 1.05, 0.16, 28]} />
            <meshStandardMaterial color="#5a3a22" roughness={0.45} />
          </mesh>
          <mesh position={[-2.2, 1.04, -1.6]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.92, 0.14, 12, 32]} />
            <meshStandardMaterial color="#4a2f1c" roughness={0.4} />
          </mesh>
          <mesh position={[-2.2, 1.045, -1.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.78, 32]} />
            <meshStandardMaterial color="#241610" roughness={0.85} />
          </mesh>
          <mesh position={[-2.2, 1.18, -1.6]}>
            <cylinderGeometry args={[0.05, 0.05, 0.3, 10]} />
            <meshStandardMaterial color="#c9a441" roughness={0.3} metalness={0.7} />
          </mesh>
          {/* green card-table alcove, right */}
          <mesh position={[3.6, 0.75, 0.2]} castShadow>
            <cylinderGeometry args={[1.1, 1.1, 0.12, 20]} />
            <meshStandardMaterial color="#2f6f4a" roughness={0.9} />
          </mesh>
          <mesh position={[3.6, 0.38, 0.2]}>
            <cylinderGeometry args={[0.16, 0.22, 0.75, 12]} />
            <meshStandardMaterial color="#3a2a1e" roughness={0.8} />
          </mesh>
          {/* broad plum runner stairs to three limestone arches */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.09 + i * 0.18, -2.6 - i * 0.55]} receiveShadow>
              <boxGeometry args={[4.6, 0.18, 0.6]} />
              <meshStandardMaterial color="#d9d2c0" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.02, -3.4]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.2, 3.2]} />
            <meshStandardMaterial color="#5b3a5e" roughness={0.95} />
          </mesh>
          {[-2.6, 0, 2.6].map((x) => (
            <mesh key={x} position={[x, 2.0, -4.2]} rotation={[0, 0, 0]}>
              <torusGeometry args={[1.0, 0.22, 10, 20, Math.PI]} />
              <meshStandardMaterial color="#efe4cf" roughness={0.9} />
            </mesh>
          ))}
          {/* curtained room, right */}
          <mesh position={[4.3, 1.6, 1.6]}>
            <boxGeometry args={[0.12, 3.0, 2.6]} />
            <meshStandardMaterial color="#7d2f4a" roughness={1} />
          </mesh>
          <pointLight position={[-3, 3.4, 1]} intensity={10} distance={10} color="#ffcf8a" />
          <pointLight position={[3.4, 3.2, 0]} intensity={8} distance={9} color="#ffb877" />
        </group>
      ) : (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[4.4, 1.0, 1.4]} />
            <meshStandardMaterial color="#2f6f6a" roughness={0.8} />
          </mesh>
          {[-3.2, -1.6, 0, 1.6, 3.2].map((x) => (
            <mesh key={x} position={[x, 1.35, 0]}>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
              <meshStandardMaterial color="#b5486b" roughness={0.7} />
            </mesh>
          ))}
        </group>
      )}

      {/* live catalogue, server-authorised browse data */}

      <pointLight position={[0, ROOM.h - 0.6, 0]} intensity={12} distance={14} color={look.accent} />
    </group>
  );
}