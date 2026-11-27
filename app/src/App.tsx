import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Marker } from "./scene/CityScene";
import { Hud } from "./ui/Hud";
import { AgentPanel } from "./ui/AgentPanel";
import { AuthPanel } from "./ui/AuthPanel";
import { MerchantPanel } from "./ui/MerchantPanel";
import { CheckoutPanel } from "./ui/CheckoutPanel";
import { AdsPanel } from "./ui/AdsPanel";
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
  const [entered, setEntered] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showAds, setShowAds] = useState(false);
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
      {!entered && (
        <button type="button" className="app__enter" onClick={() => setEntered(true)}>
          Enter the city
        </button>
      )}
      {entered && <Suspense fallback={null}>
        <SceneView
          markers={markers}
          onMarkers={onMarkers}
          onNearby={setNearby}
          onMove={sendMove}
          onFps={setFps}
          players={players}
          selfId={session?.userId ?? ""}
        />
      </Suspense>}

      <Hud session={session ?? { userId: "", displayName: "", role: "player", demo: true }} nearby={nearby} seals={quest?.seals.length ?? 0} />

      <div className="app__side">
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
        {!showAds && session && (
          <button type="button" className="app__account" onClick={() => setShowAds(true)}>
            Advertising
          </button>
        )}
        {showAds && session && <AdsPanel merchantId="mer_1" />}
        {propertyId && <AgentPanel propertyId={propertyId} agentName="Mira" />}
      </div>
    </div>
  );
}