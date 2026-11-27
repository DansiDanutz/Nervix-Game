import type { RemotePlayer } from "../net/presence";

/** Other players in the district. Public presence only. */
export function RemotePlayers({ players, selfId }: { players: RemotePlayer[]; selfId: string }) {
  return (
    <group>
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <group key={p.id} position={[p.x, 0, p.z]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <capsuleGeometry args={[0.32, 0.85, 6, 10]} />
              <meshStandardMaterial color="#b5651d" roughness={0.75} />
            </mesh>
            <mesh position={[0, 1.6, 0]}>
              <sphereGeometry args={[0.22, 12, 12]} />
              <meshStandardMaterial color="#f0c9a0" />
            </mesh>
          </group>
        ))}
    </group>
  );
}