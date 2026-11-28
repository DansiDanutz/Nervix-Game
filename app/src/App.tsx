import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Marker } from "./scene/CityScene";
import { Hud } from "./ui/Hud";
import { AgentPanel } from "./ui/AgentPanel";
import { AuthPanel } from "./ui/AuthPanel";
import { MerchantPanel } from "./ui/MerchantPanel";
import { CheckoutPanel } from "./ui/CheckoutPanel";
import { AdsPanel } from "./ui/AdsPanel";
import { AdminPanel } from "./ui/AdminPanel";
import { GuidePanel } from "./ui/GuidePanel";
import { AccessGate } from "./ui/AccessGate";
import { InteriorCatalog } from "./ui/InteriorCatalog";
import { TouchControls } from "./ui/TouchControls";
import { HOUSE_DOORS, type HouseDoor } from "./scene/HouseDoors";
import { usePresence } from "./net/presence";

const SceneView = lazy(() => import("./scene/SceneView"));
import { api, type Session, type QuestProgress } from "./net/api";
import { loadSession } from "./net/session";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [nearby, setNearby] = useState<Marker | null>(null);
  const [quest, setQuest] = useState<QuestProgress | null>(null);
  const [fps, setFps] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const [entered, setEntered] = useState(false);
  const sceneMode = params.get("scene") === "full" ? "full" : "chunks";
  const [showAuth, setShowAuth] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showAds, setShowAds] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [nearDoor, setNearDoor] = useState<HouseDoor | null>(null);
  const [interior, setInterior] = useState<HouseDoor | null>(null);
  const [teleport, setTeleport] = useState<{ x: number; z: number; key: number } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const onMarkers = useCallback((m: Marker[]) => setMarkers(m), []);
  const onPosition = useCallback((x: number, z: number) => {
    let best: HouseDoor | null = null;
    let bestD = 2.8;
    for (const d of HOUSE_DOORS) {
      const dist = Math.hypot(d.position[0] - x, d.position[2] - z);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    setNearDoor(best);
  }, []);
  const { players, status: presence, sendMove } = usePresence({
    userId: session?.userId ?? "guest",
    name: session?.displayName ?? "Traveler",
    district: "central-plaza",
  });

  useEffect(() => {
    // Resume an existing verified session; never enter on a client flag.
    void api
      .me()
      .then((me) => {
        if (me.level === "signed_out") return;
        setSession({ userId: me.userId ?? "", displayName: me.displayName ?? "Traveler", role: me.level === "build" ? "merchant_owner" : "player", demo: true });
        setEntered(true);
      })
      .catch(() => {});

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
      if (e.key.toLowerCase() === "g") setShowGuide((v) => !v);
      if (e.key === "Escape") {
        setShowGuide(false);
        setInterior(null);
      }
      if (interior && (e.key.toLowerCase() === "e" || e.key === "Enter" || e.key === "Escape")) {
        setInterior(null);
        setTeleport({ x: interior.position[0], z: interior.position[2] + 2.8, key: Date.now() });
        return;
      }
      if (!interior && (e.key.toLowerCase() === "e" || e.key === "Enter") && nearDoor) {
        void api
          .me()
          .then((me) => {
            if (me.level !== "browse" && me.level !== "build") {
              setAuthError("A completed profile is required to enter a business.");
              return;
            }
            setInterior(nearDoor);
            setTeleport({ x: 0, z: 3.2, key: Date.now() });
          })
          .catch(() => setAuthError("Could not verify your access."));
      }
      if (e.key.toLowerCase() !== "e") return;
      if (!session || !nearby) return;
      if (!nearby.id.toLowerCase().includes("seal") || quest?.seals.includes(nearby.id)) return;
      void api.collectSeal(session.userId, nearby.id).then((r) => setQuest(r.progress));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, nearby, quest, interior, nearDoor]);

  return (
    <div className="app">
      {!entered && <AccessGate onEnter={() => setEntered(true)} />}
      {entered && <Suspense fallback={null}>
        <SceneView
          markers={markers}
          onMarkers={onMarkers}
          onNearby={setNearby}
          onMove={sendMove}
          onFps={setFps}
          players={players}
          selfId={session?.userId ?? ""}
          mode={sceneMode}
          teleportTo={teleport}
          onNearDoor={setNearDoor}
          onPosition={onPosition}
          interior={interior}
          onExitInterior={() => {
            setInterior(null);
            if (interior) setTeleport({ x: interior.position[0], z: interior.position[2] + 2.8, key: Date.now() });
          }}
        />
      </Suspense>}


      {interior && <InteriorCatalog door={interior} />}
      {entered && !interior && nearDoor && (
        <TouchControls interior={false} canEnter onEnter={() => setInterior(nearDoor)} onExit={() => {}} />
      )}
      {interior && (
        <TouchControls
          interior
          canEnter={false}
          onEnter={() => {}}
          onExit={() => {
            setInterior(null);
            setTeleport({ x: interior.position[0], z: interior.position[2] + 2.8, key: Date.now() });
          }}
        />
      )}

      {entered && !interior && <Hud session={session ?? { userId: "", displayName: "", role: "player", demo: true }} nearby={nearby} seals={quest?.seals.length ?? 0} />}

      <div className="app__side" style={!entered || interior ? { display: "none" } : undefined}>
        <div className="app__status" role="status">
          {status === "connected" ? "demo API connected" : status === "connecting" ? "connecting…" : "API offline — blockout only"}
          {" · fps "}{fps || "—"}{" · presence "}
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
        {entered && !showGuide && (
          <button type="button" className="app__account" onClick={() => setShowGuide(true)}>
            District guide (G)
          </button>
        )}
        {entered && showGuide && <GuidePanel markers={markers} onClose={() => setShowGuide(false)} />}
        {authError && <div className="app__notice">{authError}</div>}
        {!showAds && session && (
          <button type="button" className="app__account" onClick={() => setShowAds(true)}>
            Advertising
          </button>
        )}
        {showAds && session && <AdsPanel merchantId="mer_1" />}
        {session?.role === "admin" && <AdminPanel userId={session.userId} />}
        {propertyId && <AgentPanel propertyId={propertyId} agentName="Mira" />}
      </div>
    </div>
  );
}