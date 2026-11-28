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
