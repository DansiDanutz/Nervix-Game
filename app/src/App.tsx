import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CityScene, type Marker } from "./scene/CityScene";
import { PlayerController } from "./player/PlayerController";
import { Hud } from "./ui/Hud";
import { loadSession } from "./net/session";

export function App() {
  const [session] = useState(loadSession);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [nearby, setNearby] = useState<Marker | null>(null);
  const onMarkers = useCallback((m: Marker[]) => setMarkers(m), []);

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 4, 12], fov: 55, near: 0.1, far: 200 }}>
        <color attach="background" args={["#bfe0ea"]} />
        <fog attach="fog" args={["#bfe0ea", 30, 90]} />
        <hemisphereLight intensity={0.55} groundColor="#c9b18a" />
        <directionalLight
          position={[12, 18, 8]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Suspense fallback={null}>
          <CityScene onMarkers={onMarkers} />
        </Suspense>
        <PlayerController markers={markers} onNearby={setNearby} />
      </Canvas>

      <Hud session={session} nearby={nearby} seals={0} />
    </div>
  );
}