import { useCallback, useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { HouseDoor } from "./HouseDoors";
import type { WorldHouse } from "../net/api/world";
import { useK2Kit } from "../world3d/MerchantHouse";
import { ProductDisplays } from "../world3d/ProductDisplays";
import { InteriorMerchantNpc } from "../world3d/MerchantNpcs";
import { interiorTemplate, selectVariant, type InteriorTemplate } from "../world/interiorTemplate";
import { interiorRoomLayout, ROOM_FRAME, type InteriorRoomLayout } from "../world/interiorLayout";
import { useHouseSnapshot } from "../world/useHouseSnapshot";
import { productSelection } from "../ui/ProductCardModel";

const ROOM = { w: ROOM_FRAME.width, d: ROOM_FRAME.depth, h: ROOM_FRAME.height };
/** The room has no plot of its own yet (B2): every house uses the K2 medium template. */
const ROOM_SIZE_CLASS = "medium";
const FLOOR = "#24313a";
const WALL = "#2f3f49";
const WOOD = "#6b4423";
const SHELF = "#8a6a48";
const COUNTER_SIZE: [number, number, number] = [1.6, 1.0, 0.6];

/** The room shell: floor, walls, the exit door on the far wall and its label (unchanged behaviour). */
function RoomShell({ accent, nearExit }: { accent: string; nearExit: boolean }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color={FLOOR} roughness={0.9} />
      </mesh>
      {[
        [0, ROOM.h / 2, -ROOM.d / 2, ROOM.w, 0.2],
        [0, ROOM.h / 2, ROOM.d / 2, ROOM.w, 0.2],
        [-ROOM.w / 2, ROOM.h / 2, 0, 0.2, ROOM.d],
        [ROOM.w / 2, ROOM.h / 2, 0, 0.2, ROOM.d],
      ].map(([x, y, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[w, ROOM.h, d]} />
          <meshStandardMaterial color={WALL} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.2, -ROOM.d / 2 + 0.15]}>
        <boxGeometry args={[1.8, 2.4, 0.12]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      <Html position={[0, 3.0, -ROOM.d / 2 + 0.3]} center distanceFactor={9}>
        <div className="door-label">
          <strong>Exit to plaza</strong>
          <small>{nearExit ? "press E" : "walk here"}</small>
        </div>
      </Html>
    </>
  );
}

/** K2 template furniture in template coordinates: shelf boards under the display slots and the counter. */
function TemplateFurniture({ layout }: { layout: InteriorRoomLayout }) {
  return (
    <>
      {layout.shelfBoards.map((b) => (
        <mesh key={b.id} name={`interior_${b.id}`} position={b.position as [number, number, number]} castShadow receiveShadow>
          <boxGeometry args={b.size as [number, number, number]} />
          <meshStandardMaterial color={SHELF} roughness={0.7} />
        </mesh>
      ))}
      <mesh
        name="interior_counter"
        position={[layout.counter.position[0], layout.counter.position[1] + COUNTER_SIZE[1] / 2, layout.counter.position[2]]}
        rotation={[0, layout.counter.yaw, 0]}
        castShadow>
        <boxGeometry args={COUNTER_SIZE} />
        <meshStandardMaterial color={WOOD} roughness={0.55} />
      </mesh>
    </>
  );
}

/** Products from the house panel's snapshot on the template slots, and the merchant's NPC at the station. */
function TemplateContents({ door, house, template }: { door: HouseDoor; house: WorldHouse | null; template: InteriorTemplate }) {
  const layout = useMemo(() => interiorRoomLayout(template), [template]);
  const listings = useHouseSnapshot(door.propertyId);
  const onSelect = useCallback((id: string) => productSelection.select(door.propertyId, id), [door.propertyId]);
  return (
    <group name="interior_template" position={layout.origin as [number, number, number]} userData={{ variant: template.variantId }}>
      <TemplateFurniture layout={layout} />
      <ProductDisplays house={listings} slots={template.displaySlots} onSelect={onSelect} />
      <InteriorMerchantNpc house={house} station={template.npcStation} />
    </group>
  );
}

/**
 * A physical walk-in room: the shell keeps its frame, bounds and exits; the furnishings come from
 * the K2 interior template (B4) with live listings (P3/P4) and the AI representative (C8).
 * `house` is the world-directory entry (null: not listed, so no NPC). Identity is never baked here.
 */
export function InteriorRoom({ door, house }: { door: HouseDoor; house: WorldHouse | null }) {
  const [nearExit, setNearExit] = useState(false);
  const kit = useK2Kit();
  const template = useMemo(() => (kit ? interiorTemplate(selectVariant(kit, door.propertyId, ROOM_SIZE_CLASS)) : null), [kit, door.propertyId]);
  const accent = house?.accent ?? door.trim;

  useFrame(({ scene }) => {
    const player = scene.getObjectByName("player");
    if (!player) return;
    const d = Math.hypot(player.position.x, player.position.z - (-ROOM.d / 2 + 0.6));
    setNearExit(d < 2.4);
  });

  return (
    <group name="nervix_interior">
      <RoomShell accent={accent} nearExit={nearExit} />
      {template && <TemplateContents door={door} house={house} template={template} />}
      <pointLight position={[0, ROOM.h - 0.6, 0]} intensity={12} distance={14} color={accent} />
      <pointLight position={[0, 3.2, 1.5]} intensity={8} distance={10} color="#ffcf8a" />
    </group>
  );
}
