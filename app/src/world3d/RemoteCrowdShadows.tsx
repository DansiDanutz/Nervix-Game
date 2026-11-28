/**
 * Contact shadows for the remote crowd on the baked arrival square (fidelity ContactShadow).
 * The instanced crowd parts only cast into the runtime shadow map, which the baked paving never
 * receives, so each full-detail figure gets one soft decal. A fixed pool of fullCap slots is
 * placed from the frame plan in RemoteCrowd's render loop; nothing re-renders per frame.
 * Without a ContactShadowSun (interiors, the salon: real shadow maps) the pool is not mounted.
 */
import { useContext } from "react";
import type * as THREE from "three";
import { AVATAR_HEIGHT } from "../player/avatarShape";
import { ContactShadow, ContactShadowSun } from "../scene/ContactShadow";
import { CROWD_LIMITS, contactShadowEntries, type CrowdPlan } from "../world/remoteCrowd";

const SLOTS = Object.freeze(Array.from({ length: CROWD_LIMITS.fullCap }, (_, i) => i));

export type ShadowSlots = (THREE.Group | null)[];

/** Moves each slot under its figure's feet; unused slots hide. Runs in the render loop. */
export function placeContactShadows(slots: ShadowSlots, plan: CrowdPlan): void {
  const entries = contactShadowEntries(plan);
  slots.forEach((slot, i) => {
    if (!slot) return;
    const e = entries[i];
    slot.visible = e !== undefined;
    if (e) slot.position.set(e.x, 0, e.z);
  });
}

export function CrowdContactShadows({ slots }: { slots: ShadowSlots }) {
  const sun = useContext(ContactShadowSun);
  if (!sun) return null;
  return (
    <group name="crowd_contact_shadows">
      {SLOTS.map((i) => (
        <group
          key={i}
          visible={false}
          ref={(g: THREE.Group | null) => {
            slots[i] = g;
          }}>
          <ContactShadow height={AVATAR_HEIGHT} />
        </group>
      ))}
    </group>
  );
}
