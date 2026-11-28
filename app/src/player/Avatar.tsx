import { AVATAR_BUILD as B, AVATAR_SCALE, type AvatarPalette } from "./avatarShape";

/** Stylised pedestrian: legs, tunic with belt, head with a hair cap. Local +z is the face. */
export function Avatar({ palette }: { palette: Readonly<AvatarPalette> }) {
  return (
    <group scale={AVATAR_SCALE}>
      {[-B.legX, B.legX].map((x) => (
        <mesh key={`leg${x}`} position={[x, B.legY, 0]} castShadow>
          <capsuleGeometry args={[B.legRadius, B.legLength, 4, 8]} />
          <meshStandardMaterial color={palette.legs} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, B.bodyY, 0]} castShadow>
        <capsuleGeometry args={[B.bodyRadius, B.bodyLength, 6, 12]} />
        <meshStandardMaterial color={palette.tunic} roughness={0.75} />
      </mesh>
      <mesh position={[0, B.beltY, 0]}>
        <cylinderGeometry args={[B.beltRadius, B.beltRadius, B.beltHeight, 16]} />
        <meshStandardMaterial color={palette.trim} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, B.headY, 0]} castShadow>
        <sphereGeometry args={[B.headRadius, 16, 16]} />
        <meshStandardMaterial color={palette.skin} roughness={0.6} />
      </mesh>
      <mesh position={[0, B.headY, 0]} rotation={[B.hairTilt, 0, 0]}>
        <sphereGeometry args={[B.hairRadius, 16, 12, 0, Math.PI * 2, 0, B.hairCover]} />
        <meshStandardMaterial color={palette.hair} roughness={0.85} />
      </mesh>
      {[-B.eyeX, B.eyeX].map((x) => (
        <mesh key={`eye${x}`} position={[x, B.eyeY, B.headRadius * 0.92]}>
          <sphereGeometry args={[B.eyeRadius, 8, 8]} />
          <meshStandardMaterial color={palette.eyes} />
        </mesh>
      ))}
    </group>
  );
}
