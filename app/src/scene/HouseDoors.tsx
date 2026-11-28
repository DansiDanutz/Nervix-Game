import { Html } from "@react-three/drei";
import { useNearFade } from "./useNearFade";
import { isDeliberateClick } from "./clickGuard";

export interface HouseDoor {
  id: string;
  propertyId: string;
  owner: string;
  label: string;
  position: [number, number, number];
  colour: string;
  trim: string;
  /** Facing of a Blender-built door (stepping back = +sin(yaw), +cos(yaw)). */
  yaw?: number;
}

/** Invisible click target for a door that Blender already built; draws nothing over it. */
function DoorTarget({ door, onDoorClick }: { door: HouseDoor; onDoorClick: (door: HouseDoor) => void }) {
  const label = useNearFade<HTMLDivElement>(door.position[0], door.position[2]);
  return (
    <group position={door.position} rotation={[0, door.yaw ?? 0, 0]} name={`door_target_${door.id}`}>
      <mesh
        position={[0, 1.4, 0]}
        userData-house={door.id}
        onClick={(e) => {
          e.stopPropagation();
          if (!isDeliberateClick(e.delta)) return;
          onDoorClick(door);
        }}>
        <boxGeometry args={[2.0, 2.8, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 3.6, 0]} center distanceFactor={10}>
        <div ref={label} className="door-label" data-testid={`label-${door.id}`}>
          <strong>{door.label}</strong>
          <small>merchant house · E or click</small>
        </div>
      </Html>
    </group>
  );
}

/**
 * Merchant doors. Labels show only the stable door label; owner identity loads inside.
 * blockout=false is for doors Blender already built (arrival square): only the
 * click target and label, never a runtime building over the Blender house.
 */
export function HouseDoors({
  doors,
  onDoorClick,
  blockout = true,
}: {
  doors: HouseDoor[];
  onDoorClick: (door: HouseDoor) => void;
  blockout?: boolean;
}) {
  if (!blockout) {
    return (
      <group>
        {doors.map((d) => (
          <DoorTarget key={d.id} door={d} onDoorClick={onDoorClick} />
        ))}
      </group>
    );
  }
  return (
    <group>
      {doors.map((d) => (
        <group key={d.id} position={d.position}>
          <mesh
            position={[0, 1.4, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              if (!isDeliberateClick(e.delta)) return;
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
