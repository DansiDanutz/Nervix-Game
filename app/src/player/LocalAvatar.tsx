/**
 * The local player's figure (C7 hookup): the K1 skinned avatar in the player's
 * preset, driven by playerState through the locomotion state machine, with the
 * fidelity lane's soft ContactShadow composed beside it. If the K1 kit or GLB
 * fails, SkinnedAvatar's error boundary falls back to the stylised Avatar.
 * SkinnedAvatar turns itself toward travel: the parent must not set rotation.y.
 */
import { DEFAULT_PRESET } from "../net/api/avatar";
import { ContactShadow } from "../scene/ContactShadow";
import { SkinnedAvatar } from "../world3d/SkinnedAvatar";
import { Avatar } from "./Avatar";
import { AVATAR_HEIGHT, LOCAL_PALETTE } from "./avatarShape";
import { playerState } from "./playerState";

/** rotation.y that faces the look direction (forward = (-sin yaw, -cos yaw)); 0 faces +z. */
const headingOf = (yaw: number) => Math.atan2(-Math.sin(yaw), -Math.cos(yaw));

export function LocalAvatar({ preset, spawnYaw }: { preset: string | null; spawnYaw: number }) {
  return (
    <>
      <ContactShadow height={AVATAR_HEIGHT} />
      <SkinnedAvatar
        preset={preset ?? DEFAULT_PRESET}
        source={playerState.ref}
        initialHeading={headingOf(spawnYaw)}
        debug
        fallback={<Avatar palette={LOCAL_PALETTE} shadow={false} />}
      />
    </>
  );
}
