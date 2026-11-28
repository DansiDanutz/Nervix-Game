import { Avatar } from "../player/Avatar";
import { REMOTE_PALETTE } from "../player/avatarShape";
import type { RemotePlayer } from "../net/presence";

/** Other players in the district. Public presence only. */
export function RemotePlayers({ players, selfId }: { players: RemotePlayer[]; selfId: string }) {
  return (
    <group>
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <group key={p.id} position={[p.x, 0, p.z]}>
            <Avatar palette={REMOTE_PALETTE} />
          </group>
        ))}
    </group>
  );
}