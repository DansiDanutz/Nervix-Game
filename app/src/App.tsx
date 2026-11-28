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
import type { HouseDoor } from "./scene/HouseDoors";
import { arrival, danggDoor, loadSliceLayout, near, STREET_SPAWN, TEST_BUILDER_DOOR, type Anchor, type Place, type SliceLayout } from "./scene/slice";
import { usePresence } from "./net/presence";

const SceneView = lazy(() => import("./scene/SceneView"));
import { api, type Session, type QuestProgress } from "./net/api";
import { loadSession } from "./net/session";

type Target =
  | { kind: "venue"; label: string }
  | { kind: "house"; door: HouseDoor; label: string }
  | { kind: "exit"; label: string };

const ROOM_EXIT: Anchor = { x: 0, z: 4.3 };

function targetAt(place: Place, layout: SliceLayout | null, x: number, z: number): Target | null {
  if (place.kind === "house") {
    return near(ROOM_EXIT, x, z, 2.2) || near({ x: 0, z: -4.0 }, x, z, 2.2) ? { kind: "exit", label: "Plaza" } : null;
  }
  if (!layout) return null;
  if (place.kind === "venue") {
    const dangg = danggDoor(layout);
    if (near(layout.salon.danggDoor, x, z)) return { kind: "house", door: dangg, label: "DanGG" };
    if (near(layout.salon.exit, x, z)) return { kind: "exit", label: "Plaza" };
    return null;
  }
  if (near(layout.facadeDoor, x, z, 3.0)) return { kind: "venue", label: "OpenPoker" };
  const t = TEST_BUILDER_DOOR.position;
  if (near({ x: t[0], z: t[2] }, x, z, 2.8)) return { kind: "house", door: TEST_BUILDER_DOOR, label: TEST_BUILDER_DOOR.label };
  return null;
}

function placeLabel(place: Place) {
  if (place.kind === "plaza") return "Plaza · WASD to walk · drag to look · Q/R turn";
  if (place.kind === "venue") return "OpenPoker salon · DanGG's house is in the right alcove · Esc returns to the plaza";
  return `${place.door.label} · Esc returns to the plaza`;
}

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
  const [place, setPlace] = useState<Place>({ kind: "plaza" });
  const [layout, setLayout] = useState<SliceLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<Anchor>(STREET_SPAWN);
  const [target, setTarget] = useState<Target | null>(null);
  const [teleport] = useState<{ x: number; z: number; key: number; yaw?: number } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const interior = place.kind === "house" ? place.door : null;
  const onMarkers = useCallback((m: Marker[]) => setMarkers(m), []);

  useEffect(() => {
    loadSliceLayout().then(setLayout).catch((e: Error) => setLayoutError(e.message));
  }, []);

  /** What the player can interact with from where they stand. */
  const onPosition = useCallback(
    (x: number, z: number) => {
      setTarget(targetAt(place, layout, x, z));
    },
    [place, layout],
  );

  const go = useCallback(
    async (next: Place) => {
      if (next.kind !== "plaza") {
        // Entering any business needs a completed profile; the server re-checks every read.
        const me = await api.me().catch(() => null);
        if (!me || (me.level !== "browse" && me.level !== "build")) {
          setAuthError("A completed profile is required to enter a business.");
          return;
        }
      }
      if (!layout) return;
      setAuthError(null);
      setSpawn(arrival(next, place, layout));
      setTarget(null);
      setPlace(next);
    },
    [layout, place],
  );

  const activate = useCallback(
    (t: Target | null) => {
      if (!t) return;
      if (t.kind === "venue") void go({ kind: "venue", id: "openpoker" });
      else if (t.kind === "house") void go({ kind: "house", door: t.door, from: place.kind === "venue" ? "openpoker" : "plaza" });
      else void go({ kind: "plaza" });
    },
    [go, place],
  );

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixPlace = place.kind === "house" ? `house:${place.door.id}` : place.kind;
  }, [place]);
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
        if (!alive) return;
        setSession(s);
        // Only eligible builders reserve a property; visitors just explore.
        const property = await api.provision(s.userId, "merchant").then((r) => r.property).catch(() => null);
        if (!alive) return;
        if (property) setPropertyId(property.id);
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
      if (e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
      if (e.key.toLowerCase() === "g") setShowGuide((v) => !v);
      if (e.key === "Escape") {
        setShowGuide(false);
        if (place.kind !== "plaza") void go({ kind: "plaza" });
        return;
      }
      if ((e.key.toLowerCase() === "e" || e.key === "Enter") && target) {
        activate(target);
        return;
      }
      if (e.key.toLowerCase() !== "e") return;
      if (!session || !nearby) return;
      if (!nearby.id.toLowerCase().includes("seal") || quest?.seals.includes(nearby.id)) return;
      void api.collectSeal(session.userId, nearby.id).then((r) => setQuest(r.progress));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, nearby, quest, place, target, go, activate]);

  return (
    <div className="app">
      {!entered && <AccessGate onEnter={() => setEntered(true)} />}
      {entered && <Suspense fallback={null}>
        <SceneView
          markers={place.kind === "plaza" ? markers : []}
          onMarkers={onMarkers}
          onNearby={setNearby}
          onMove={sendMove}
          onFps={setFps}
          players={players}
          selfId={session?.userId ?? ""}
          mode={sceneMode}
          teleportTo={teleport}
          onPosition={onPosition}
          place={place}
          layout={layout}
          spawn={spawn}
          onEnterHouse={(door) => activate({ kind: "house", door, label: door.label })}
          onEnterVenue={() => activate({ kind: "venue", label: "OpenPoker" })}
        />
      </Suspense>}


      {interior && <InteriorCatalog door={interior} />}
      {entered && (
        <div className="place-hint" data-testid="place-hint" data-place={place.kind === "house" ? `house:${place.door.id}` : place.kind}>
          {target ? `E / Enter or click · ${target.kind === "exit" ? "Return to the plaza" : `Enter ${target.label}`}` : placeLabel(place)}
        </div>
      )}
      {entered && layoutError && <div className="app__notice" role="alert">{layoutError}</div>}
      {entered && target && (
        <TouchControls interior={target.kind === "exit"} canEnter={target.kind !== "exit"} onEnter={() => activate(target)} onExit={() => activate(target)} />
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