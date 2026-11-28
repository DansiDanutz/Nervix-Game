import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Marker } from "./scene/CityScene";
import { Hud } from "./ui/Hud";
import { GuidePanel } from "./ui/GuidePanel";
import { AccessGate } from "./ui/AccessGate";
import { InteriorCatalog } from "./ui/InteriorCatalog";
import { TouchControls } from "./ui/TouchControls";
import { PanelHost } from "./ui/PanelHost";
import { InteriorPanelHost } from "./ui/InteriorPanelHost";
import { PlayerChat } from "./ui/PlayerChat";
import { arrival, loadSliceLayout, STREET_SPAWN, streetSpawn, type Anchor, type SliceLayout } from "./scene/slice";
import { usePresence } from "./net/presence";
import { api, type Session } from "./net/api";
import { PLAZA, placeKey, placeStore, resetPlace, type Place } from "./world/place";
import { usePlace } from "./world/usePlace";
import { destinationOf, targetAt, type Target } from "./world/targets";
import { sidePanels } from "./features/sidePanels";
import type { ShellContext } from "./features/panelContext";
import { useHintsSettled } from "./shell/useHintsSettled";
import { useWorldSession } from "./shell/useWorldSession";
import { useWorldKeys } from "./shell/useWorldKeys";
import { HintStack } from "./shell/HintStack";

const SceneView = lazy(() => import("./scene/SceneView"));

/** Walking this far from the arrival spawn ends the arrival shot (quest card opens). */
const EXPLORE_DISTANCE = 1.0;
const PROFILE_REQUIRED = "A completed profile is required to enter a business.";
const NO_SESSION: Session = { userId: "", displayName: "", role: "player", demo: true };

export function App() {
  const [entered, setEntered] = useState(false);
  const { session, setSession, propertyId, status, quest, setQuest } = useWorldSession(() => setEntered(true));
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [nearby, setNearby] = useState<Marker | null>(null);
  const [fps, setFps] = useState(0);
  const params = new URLSearchParams(window.location.search);
  // FPS and presence diagnostics are for developers only: ?debug=1.
  const debug = params.get("debug") === "1";
  const sceneMode = params.get("scene") === "full" ? "full" : "chunks";
  const [exploring, setExploring] = useState(false);
  const [questPinned, setQuestPinned] = useState<boolean | null>(null);
  const questOpen = questPinned ?? exploring;
  const [showGuide, setShowGuide] = useState(false);
  useState(resetPlace); // once per mount, before the first read of the place
  const place = usePlace();
  const hintsSettled = useHintsSettled(entered, placeKey(place));
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
          setAuthError(PROFILE_REQUIRED);
          return;
        }
      }
      if (!layout) return;
      setAuthError(null);
      setSpawn(arrival(next, place, layout));
      setTarget(null);
      // Interaction prompts belong to the place being left.
      setNearby(null);
      placeStore.set(next);
    },
    [layout, place],
  );

  const activate = useCallback((t: Target | null) => {
    if (t) void go(destinationOf(t, place));
  }, [go, place]);
  const goPlaza = useCallback(() => void go(PLAZA), [go]);
  const toggleGuide = useCallback(() => setShowGuide((v) => !v), []);
  const closeGuide = useCallback(() => setShowGuide(false), []);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__nervixPlace = placeKey(place);
  }, [place]);
  const { players, status: presence, sendMove } = usePresence({
    userId: session?.userId ?? "guest",
    name: session?.displayName ?? "Traveler",
    district: "central-plaza",
  });

  useWorldKeys({ session, nearby, quest, place, target, goPlaza, activate, toggleGuide, closeGuide, onQuest: setQuest });

  const shellCtx = useMemo<ShellContext>(() => ({
    session, propertyId, entered, showGuide,
    openGuide: () => setShowGuide(true),
    onSignedIn: (s) => {
      setSession(s);
      void api.progress(s.userId).then((r) => setQuest(r.progress));
    },
  }), [session, propertyId, entered, showGuide, setSession, setQuest]);

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
      {entered && <InteriorPanelHost ctx={shellCtx} />}
      {entered && <PlayerChat enterFocuses={target === null} />}
      {entered && <HintStack place={place} target={target} settled={hintsSettled} />}
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
          session={session ?? NO_SESSION}
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
        <PanelHost registry={sidePanels} ctx={shellCtx} />
        {/* G toggles the guide even while the menu is closed. */}
        {entered && showGuide && <GuidePanel markers={districtMarkers} onClose={() => setShowGuide(false)} />}
      </div>
    </div>
  );
}
