# Measured performance — 2026-11-28

Method: headless Chrome 158 + CDP, app on Vite, district loaded, 180 requestAnimationFrame
frames timed in-page, `?enter=1` deep link.

| Renderer | FPS | Note |
|---|---|---|
| **GPU (Metal, default headless)** | **60** | vsync-capped; the real Mac Studio path |
| SwiftShader (software) | 22–27 | CPU rasteriser, not representative |

Frame capture at 756×469: 1,068+ distinct colours, ~98% non-background — geometry is drawing.

Optimisations applied: static meshes joined per chunk, small props no longer cast shadows,
shadow map 1024, DPR capped at 1.5, sphere/cylinder segments reduced.

Bundle: app shell 17.15 kB (5.63 kB gzip); three.js 1168 kB lazy on entry.

## Presence transport (C4) — 2026-11-28

Method: `cd server && node scripts/presence-load.mjs --spawn --bots 50,100,200 --seconds 10 --hz 10`.
The script starts `src/index.mjs` in demo mode (no database) on a free loopback port (here 62039). It never
uses the E2E port 28797 that the plan row names: that port belongs to the E2E runs, which a concurrent
workflow owns, so the script refuses it. It then opens N bot sockets on the plaza. Each bot moves at 10 Hz,
starting at a random phase inside its first 100 ms so the bots' timers do not line up with the server tick. Mac Studio, Node v26.13.0, bots and server on the same machine. Server CPU and RSS come from
`ps` sampled every 500 ms (the macOS `%cpu` column is a decaying average, so read it as a rough figure).

| Bots | Joined | Join p50 / p95 (ms) | Move→delta echo p50 / p95 / p99 (ms) | Frames per bot per s | KB per bot per s | Server CPU avg | Server RSS max | Errors |
|---|---|---|---|---|---|---|---|---|
| 50 | 50 | 6.8 / 7.0 | 61.9 / 105.3 / 109.5 | 9.9 | 78.3 | 2.7% | 69 MB | 0 |
| 100 | 100 | 2.3 / 3.1 | 66.2 / 106.0 / 116.0 | 9.8 | 154.2 | 3.1% | 78 MB | 0 |
| 200 | 200 | 2.0 / 3.0 | 69.4 / 113.9 / 149.4 | 9.6 | 300.7 | 3.8% | 79 MB | 0 |

How to read it:
- **Frames are flat at about 10 per bot per second.** Snapshots go out on the 10 Hz tick, one `delta` per
  room, whatever the move rate. Before C4, every accepted move sent a full room snapshot to every member,
  so frames grew with N² (read from the C3 code; the C3 build was not load-tested).
- **Echo latency is bounded by the tick.** A move waits at most one tick (100 ms) before its delta, so with
  random bot phases the p50 sits a little above half a tick (62, 66 and 69 ms) and grows slowly with N.
  p95 stayed near one tick; p99 reached 149 ms at 200 bots. An earlier run without phase offsets gave
  p50s of 88.6 / 31.2 / 94.1 ms, which only showed how the bot timers lined up with the tick.
- **Bandwidth is still linear in the room size.** Every bot moves every tick, so each delta carries all N
  players (about 160 bytes each). At 200 bots that is about 313 KB/s per client, or about 61 MB/s of
  server egress in total. That is acceptable on loopback but too much for mobile clients in a full room.
  If C6 or later needs more headroom, the next steps are interest management (send only players within a
  radius) and quantised or binary positions. Neither is built.

Transport settings (all defaults can be overridden by options or the environment, and out-of-range values
are ignored):

| Setting | Default | Environment |
|---|---|---|
| Tick (snapshot rate) | 100 ms (10 Hz) | `PRESENCE_TICK_MS` (10–1000) |
| Heartbeat (ping; a socket silent for a whole heartbeat is terminated) | 15 s | `PRESENCE_HEARTBEAT_MS` (1000–120000) |
| Room capacity | 200 | `PRESENCE_ROOM_CAPACITY` (1–5000) |
| Open sockets | 400 | `PRESENCE_MAX_CONNECTIONS` (1–20000) |
| Move token bucket | burst 20, 20/s | option only |
| Emote token bucket | burst 3, 1/s | option only |
| Origin allow-list | same host and loopback | `PRESENCE_ALLOWED_ORIGINS` (comma list) |
| Unread backlog per socket (past it, the socket is terminated, even if it keeps sending) | 1 MB | option only (`maxBufferedBytes`) |

## Crowd rendering (C6) — budget, 2026-11-28

Status: logic and components written and unit-tested; **not yet mounted and not yet measured**. The
GPU numbers below are the budget the C6 E2E (`app/e2e/crowd.spec.ts`, unrun) must confirm and record.

Code: `app/src/world/remoteCrowd.ts` (pure: interpolation and LOD plan, 21 unit tests) and
`app/src/world3d/RemoteCrowd.tsx` with `RemoteCrowdParts.tsx` and `RemoteCrowdLabels.tsx` (three.js).

Interpolation:
- Each presence sample (10 Hz tick) starts a tween from the pose drawn now to the sample, lasting one
  tick (`INTERP_MS` = 100 ms). Motion is continuous and never jumps back; the cost is up to one tick of
  extra display latency on top of the C4 echo latency.
- Yaw takes the shortest arc (170° → −170° turns 20°). There is no `seq` on the wire (C9 `PUBLIC_FIELDS`:
  id, name, preset, place, x, z, yaw), so the crowd relies on in-order arrival on the one socket: the latest
  sample wins, and a repeated pose keeps the running tween.
- Facing: presence `yaw` is the look yaw (forward = (−sin, −cos), yaw 0 looks toward −z). The crowd figure
  looks along local +z, so the body rotation is `bodyYaw = yaw + π`, converted once on ingest (unit-tested).
- A jump over `SNAP_DISTANCE` (6 m) or a place change snaps instead of sliding. Non-finite samples are dropped.

Level of detail, decided every frame from the camera position, nearest first:

| Tier | Who | Draw calls | Shadows |
|---|---|---|---|
| Full detail, near | the full-detail players within 8 m, at most 8 | 6 instanced part meshes (legs, tunic, belt, head, hair, eyes) | yes (the only crowd shadow casters) |
| Full detail, mid | the rest of the 30 nearest within 25 m | 6 instanced part meshes | no |
| Impostor | everyone else (beyond 25 m, or past the 30 cap) | 1 instanced capsule tinted with the tunic colour | no |
| Labels | full-detail players within 15 m, at most 12 | 1 sprite each (canvas text, one texture per name) | — |

- Thresholds hold a 1 m hysteresis, so a player standing on a boundary does not flicker between tiers.
- **Crowd draw calls are bounded: at most 13 meshes + 12 labels = 25**, whatever the room size (cap 200),
  plus 6 shadow-pass calls for the near set. The old `RemotePlayers.tsx` drew 8 meshes per player with
  their own geometry and materials, all casting shadows: 800 calls (and 600 shadow calls) at 100 players.
- Geometry and materials are shared: 7 geometries and 7 materials for the whole crowd, plus one label
  texture per distinct name (unused textures are freed past 64). Per-instance colour comes from the preset.
- Triangles: a full-detail figure is about 1.1k triangles, an impostor about 100. 30 full + 170 impostors
  ≈ 50k triangles.
- Crowd meshes ignore raycasts, so doors and props behind players stay clickable.

Not covered here: skinned animation for the nearest players is C7 (it replaces the near tier); bandwidth
headroom (interest management, quantised positions) is still the open C4 note above.

To measure (after the lead mounts it): `PW_GL=metal ... pnpm exec playwright test e2e/crowd.spec.ts`.
It prints `[crowd] {...}` lines (fps, calls, triangles and tier counts) for desktop and mobile emulation
and writes `docs/evidence/slice/crowd-labelled-{desktop,mobile}.png`. `calls` is read from
`renderer.info` in the frame loop, so it is the previous frame's last render pass; if post-processing
renders several passes, read it as a lower bound.

### Skinned avatar (C7) — budget, not measured, 2026-11-28

- `world3d/SkinnedAvatar.tsx` (unmounted) draws the K1 pedestrian (`kits/k1/k1_pedestrian.glb`, about 2.5–3.4k
  triangles per preset, 18 joints) with one `AnimationMixer` per avatar and three always-playing actions
  (idle, walk, run) whose weights come from `world/locomotion.ts`. CPU cost is one mixer update per avatar
  per frame; the GLB is loaded once (`useGLTF` cache) and cloned per avatar with `SkeletonUtils.clone`. The
  K1 manifest is fetched and parsed once for all avatars (`world3d/k1Dress.ts`, cached promise; a failure is
  retried by the next avatar). `scene/Pedestrians.tsx` still keeps its own copy until the fidelity lane
  imports `useK1Kit`/`dressK1` from there.
- Foot slide: the K1 walk is authored at 1.4 m/s and CT1 walks at 4.2 m/s, so walk plays at 3x;
  `WALK_MAX_PLAYBACK_RATE` is 3.2, so walk is unclamped at walking speed (run, 7.14 / 3.6 = 1.98, is unclamped
  under its own 2x cap). Walk and run are posed from one shared normalised gait phase while blended
  (`gaitCycleRate`), so the legs stay in step between 4.2 and 7.14 m/s. A 3x walk reads brisk; re-authoring
  the K1 walk near 4.2 m/s would let the walk cap come back down.
- Draw calls: one per visible part mesh per avatar (body, garment, hair, 0–2 accessories, so 3–5) plus their
  shadow passes. Recoloured materials are cloned per avatar and disposed on unmount.
- Proposed cap: the local player plus the 8 nearest remote players skinned (inside the C6 near/shadow tier,
  8 m), the rest stay on the C6 instanced parts and impostors. That is at most 45 extra calls.
- To measure after mounting: read `__nervixCrowd.calls` with and without the skinned near tier.

### Fixture walkers and merchant NPCs (C8) — budget, not measured, 2026-11-28

- `server/scripts/fixture-walkers.mjs` (DEMO only) adds at most 8 presence sockets (default 6) moving at 5 Hz
  at 1.4 m/s: about 30 moves per second into the plaza room, well inside the C4 load runs above (100 bots at
  10 Hz). They render as ordinary remote players through the C6 crowd tiers, so they count against its caps.
- Seeding is opt-in and separate from the slice fixtures: after `node seed/slice-fixtures.mjs`, run
  `NERVIX_WORLD_SLICE=1 node seed/walker-fixtures.mjs` (same DATABASE_URL), then the walker service.
- Guard limitation: the slice / live-payments / production checks read the walker's own environment; the
  server's `/health` only reports the hard-coded `DEMO_MODE`. Run the walkers from the server's shell
  environment until `/health` reports the server's real payment mode and NODE_ENV.
- `world3d/MerchantNpcs.tsx` (unmounted) draws one idle K1 skinned NPC per street house with a manifest plot
  (7 directory houses today, 6 on the street) plus one two-line label sprite each: 3–5 calls per NPC, so
  about 36 calls with 6 street NPCs. NPCs stand inside their houses, so most are occluded from the plaza;
  if the budget is tight the scene wave can mount them only near the player or only inside the house room
  (`InteriorMerchantNpc`, one NPC).
- To measure after mounting: `__nervixCrowd.calls` and `renderer.info.render.calls` with and without
  `<MerchantNpcs>`, with the walkers running.
