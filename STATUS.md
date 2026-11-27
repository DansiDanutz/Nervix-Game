# Status

Verified 2026-11-27. Nothing here is claimed without a command or a file behind it.

| Capability | State | Evidence |
|---|---|---|
| Repo + licence | working | `LICENSE` AGPL-3.0-only, commit `3c0fbca` |
| Backend order/payment state machine | working (demo) | `node --test test/` → 14/14 pass |
| Idempotent property provisioning | working (demo) | same test run |
| Demo NervixPay adapter | demo | `server/src/nervixpay.demo.mjs`, `DEMO_MODE = true` |
| Database schema | applied | `nervix_world` on PG 16.15; migrations 001–004 green |
| Seed demo merchants | applied | 3 users / 3 merchants / 3 properties / 3 agents |
| Persistence | working | `store.mjs`; orders, properties, campaigns, conversations survive restart |
| Browser runtime | builds, wired to API | `pnpm build` → tsc + Vite, 595 modules; agent chat + confirm UI |
| 3D world | **blockout only** | no `.blend`, no GLB; `CityScene` falls back to primitives |
| Blender pipeline | **blocked** | Blender not installed |
| Reference images | present, not visually inspected | `docs/references/` 4 PNG 1672×941, hashes + palette check |
| Merchant AI employees | working (offline provider) | `agent.mjs` + `conversation.mjs`, 41 tests; grounded replies, authorized tools, confirmation gate |
| Paid advertising | state machine + API working (demo) | `server/src/campaigns.mjs`; unpaid campaigns never serve |
| Demo API | working | `PORT=8787 node server/src/index.mjs`; curl smoke-tested |
| Live NervixPay | **blocked** | endpoints/credentials undocumented here |
| Multiplayer presence | working (demo) | `presence.mjs` + `usePresence`; 2 clients see each other, leave removes them |
| Ads | schema + state machine | `ad_placements`, `campaigns` tables; `campaigns.mjs` |

## Blocked by an external dependency

1. **Blender 4.x** — blocks every visual deliverable and Milestone 0.
2. **Four concept images** — present but not visually inspected (no image input).
3. **NervixPay live docs/credentials** — blocks real payments; demo adapter covers the journey.

## Measured

- App bundle: 1,173 kB minified / 327 kB gzip (three.js dominates). Code-splitting is an open performance task against the 60 FPS desktop / 30 FPS mobile targets, which are **not yet measured**.