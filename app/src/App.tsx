import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CityScene, type Marker } from "./scene/CityScene";
import { PlayerController } from "./player/PlayerController";
import { Hud } from "./ui/Hud";
import { AgentPanel } from "./ui/AgentPanel";
import { AuthPanel } from "./ui/AuthPanel";
import { MerchantPanel } from "./ui/MerchantPanel";
import { CheckoutPanel } from "./ui/CheckoutPanel";
import { RemotePlayers } from "./scene/RemotePlayers";
import { usePresence } from "./net/presence";
import { api, type Session, type QuestProgress } from "./net/api";
import { loadSession } from "./net/session";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [nearby, setNearby] = useState<Marker | null>(null);
  const [quest, setQuest] = useState<QuestProgress | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const onMarkers = useCallback((m: Marker[]) => setMarkers(m), []);
  const { players, status: presence, sendMove } = usePresence({
    userId: session?.userId ?? "guest",
    name: session?.displayName ?? "Traveler",
    district: "central-plaza",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.session(loadSession().userId);
        const { property } = await api.provision(s.userId, "merchant");
        if (!alive) return;
        setSession(s);
        setPropertyId(property.id);
        setQuest((await api.progress(s.userId)).progress);
        setStatus("connected");
      } catch {
        if (alive) setStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e") return;
      if (!session || !nearby) return;
      if (!nearby.id.toLowerCase().includes("seal") || quest?.seals.includes(nearby.id)) return;
      void api.collectSeal(session.userId, nearby.id).then((r) => setQuest(r.progress));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, nearby, quest]);

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
        <PlayerController markers={markers} onNearby={setNearby} onMove={sendMove} />
        <RemotePlayers players={players} selfId={session?.userId ?? ""} />
      </Canvas>

      <Hud session={session ?? { userId: "", displayName: "", role: "player", demo: true }} nearby={nearby} seals={quest?.seals.length ?? 0} />

      <div className="app__side">
        <div className="app__status" role="status">
          {status === "connected" ? "demo API connected" : status === "connecting" ? "connecting…" : "API offline — blockout only"}
          {" · presence "}
          {presence === "live" ? `live (${players.length})` : presence}
        </div>
        {showAuth && (
          <AuthPanel
            onSignedIn={(s) => {
              setSession(s);
              setShowAuth(false);
              void api.progress(s.userId).then((r) => setQuest(r.progress));
            }}
          />
        )}
        {!showAuth && session && (
          <button type="button" className="app__account" onClick={() => setShowAuth(true)}>
            {session.verified ? `Verified: ${session.displayName}` : "Sign in with email"}
          </button>
        )}
        {!showMerchant && propertyId && session && (
          <button type="button" className="app__account" onClick={() => setShowMerchant(true)}>
            Merchant workspace
          </button>
        )}
        {showMerchant && propertyId && session && (
          <MerchantPanel merchantId="mer_1" propertyId={propertyId} />
        )}
        {session && !showOrders && (
          <button type="button" className="app__account" onClick={() => setShowOrders(true)}>
            Orders
          </button>
        )}
        {showOrders && session && <CheckoutPanel userId={session.userId} />}
        {propertyId && <AgentPanel propertyId={propertyId} agentName="Mira" />}
      </div>
    </div>
  );
}