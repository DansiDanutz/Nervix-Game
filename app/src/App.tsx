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
import { SideMenu } from "./ui/SideMenu";
import type { HouseDoor } from "./scene/HouseDoors";
import { arrival, danggDoor, loadSliceLayout, near, STREET_SPAWN, streetSpawn, testBuilderDoor, type Anchor, type Place, type SliceLayout } from "./scene/slice";
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
  const builder = testBuilderDoor(layout);
  const t = builder.position;
  if (near({ x: t[0], z: t[2] }, x, z, 2.8)) return { kind: "house", door: builder, label: builder.label };
  return null;
}

/** Walking this far from the arrival spawn ends the arrival shot (quest card opens). */
const EXPLORE_DISTANCE = 1.0;
/** Idle bottom hints fade after this long on arrival (ms). */
const HINT_FADE_MS = 6000;

function placeLabel(place: Place) {
  if (place.kind === "plaza") return "Plaza · WASD to walk · Shift to run · drag to look · Q/R turn";
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
  // FPS and presence diagnostics are for developers only: ?debug=1.
  const debug = params.get("debug") === "1";
  const [exploring, setExploring] = useState(false);
  const [questPinned, setQuestPinned] = useState<boolean | null>(null);
  const questOpen = questPinned ?? exploring;
  const [entered, setEntered] = useState(false);
  // The bottom hints sit over the foreground compass-rose medallion: fade them after the first
  // input or a few seconds, whichever comes first. Door prompts ("E / Enter ...") always show.
  const [hintsSettled, setHintsSettled] = useState(false);
  useEffect(() => {
    if (!entered || hintsSettled) return;
    const settle = () => setHintsSettled(true);
    const timer = window.setTimeout(settle, HINT_FADE_MS);
    window.addEventListener("keydown", settle);
    window.addEventListener("pointerdown", settle);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", settle);
      window.removeEventListener("pointerdown", settle);
    };
  }, [entered, hintsSettled]);
  const sceneMode = params.get("scene") === "full" ? "full" : "chunks";
  const [showAuth, setShowAuth] = useState(false);
  const [showMerchant, setShowMerchant] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showAds, setShowAds] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [place, setPlace] = useState<Place>({ kind: "plaza" });
  // A new place shows its name again; it fades on the next input or after HINT_FADE_MS.
  const placeKey = place.kind === "house" ? `house:${place.door.id}` : place.kind;
  useEffect(() => setHintsSettled(false), [placeKey]);
  const [layout, setLayout] = useState<SliceLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<Anchor>(STREET_SPAWN);
  const [target, setTarget] = useState<Target | null>(null);
  const [teleport] = useState<{ x: number; z: number; key: number; yaw?: number } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const interior = place.kind === "house" ? place.door : null;
  const onMarkers = useCallback((m: Marker[]) => setMarkers(m), []);
  // District markers were authored for the legacy plaza chunks: never shown outside the plaza,
  // and not on top of the Blender arrival square that supersedes those chunks.
  const districtMarkers = place.kind === "plaza" && !layout?.plaza ? markers : [];

  useEffect(() => {
    loadSliceLayout()
      .then((l) => {
        setLayout(l);
        // Arrive where the Blender camera study put the street spawn, when exported.
        setSpawn(streetSpawn(l));
      })
      .catch((e: Error) => setLayoutError(e.message));
  }, []);

  /** What the player can interact with from where they stand. */
  const onPosition = useCallback(
    (x: number, z: number) => {
      setTarget(targetAt(place, layout, x, z));
      if (!exploring && Math.hypot(x - spawn.x, z - spawn.z) > EXPLORE_DISTANCE) setExploring(true);
    },
    [place, layout, exploring, spawn],
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
      // Interaction prompts belong to the place being left.
      setNearby(null);
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
      {/* The scene mounts once the layout is known, so the first frame is the real arrival. */}
      {entered && (layout || layoutError) && <Suspense fallback={null}>
        <SceneView
          markers={districtMarkers}
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
          onArrivalError={setArrivalError}
        />
      </Suspense>}


      {interior && <InteriorCatalog door={interior} />}
      {entered && (
        // One stacked hint region: the place/controls hint and the privacy note never overlap.
        <div className="hint-stack" data-testid="hint-stack">
          <div className={`place-hint${hintsSettled && !target ? " is-faded" : ""}`} data-testid="place-hint" data-place={place.kind === "house" ? `house:${place.door.id}` : place.kind}>
            {target ? `E / Enter or click · ${target.kind === "exit" ? "Return to the plaza" : `Enter ${target.label}`}` : placeLabel(place)}
          </div>
          {!interior && <div className={`controls-hint${hintsSettled ? " is-faded" : ""}`} data-testid="controls-hint">Merchant conversations are private</div>}
        </div>
      )}
      {entered && layoutError && <div className="app__notice" role="alert">{layoutError}</div>}
      {entered && arrivalError && place.kind === "plaza" && <div className="app__notice" role="alert">{arrivalError}</div>}
      {entered && layout && !layout.plaza && place.kind === "plaza" && (
        <div className="app__notice" role="status" data-testid="arrival-missing">
          Arrival square not exported yet (no runtime_layout.plaza in /slice/manifest.json): showing the legacy district.
        </div>
      )}
      {entered && target && (
        <TouchControls interior={target.kind === "exit"} canEnter={target.kind !== "exit"} onEnter={() => activate(target)} onExit={() => activate(target)} />
      )}
      {entered && !interior && <Hud
          session={session ?? { userId: "", displayName: "", role: "player", demo: true }}
          nearby={place.kind === "plaza" ? nearby : null}
          seals={quest?.seals.length ?? 0}
          questOpen={questOpen}
          onToggleQuest={() => setQuestPinned(!questOpen)}
        />}

      <div className="app__side" style={!entered || interior ? { display: "none" } : undefined}>
        {debug ? (
          <div className="app__status" role="status" data-testid="debug-status">
            {status === "connected" ? "demo API connected" : status === "connecting" ? "connecting…" : "API offline — blockout only"}
            {" · fps "}{fps || "—"}{" · presence "}
            {presence === "live" ? `live (${players.length})` : presence}
          </div>
        ) : (
          // Players only hear about the connection when something is wrong.
          status === "offline" && <div className="app__status" role="status">API offline — blockout only</div>
        )}
        {authError && <div className="app__notice">{authError}</div>}
        <SideMenu>
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
        {!showAds && session && (
          <button type="button" className="app__account" onClick={() => setShowAds(true)}>
            Advertising
          </button>
        )}
        {showAds && session && <AdsPanel merchantId="mer_1" />}
        {session?.role === "admin" && <AdminPanel userId={session.userId} />}
        {propertyId && <AgentPanel propertyId={propertyId} agentName="Mira" />}
        </SideMenu>
        {/* G toggles the guide even while the menu is closed. */}
        {entered && showGuide && <GuidePanel markers={districtMarkers} onClose={() => setShowGuide(false)} />}
      </div>
    </div>
  );
}