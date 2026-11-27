# Status

Verified 2026-11-27. Nothing here is claimed without a command or a file behind it.

| Capability | State | Evidence |
|---|---|---|
| Repo + licence | working | `LICENSE` AGPL-3.0-only, commit `3c0fbca` |
| Backend order/payment state machine | working (demo) | `node --test test/` → 64/64 pass |
| Idempotent property provisioning | working (demo) | same test run |
| Demo NervixPay adapter | demo | `server/src/nervixpay.demo.mjs`, `DEMO_MODE = true` |
| Database schema | applied | `nervix_world` on PG 16.15; migrations 001–007 green |
| Refunds | working (demo) | paid/fulfilled → refunded once, persisted; migration 011 |
| Checkout + orders | working (demo) | `CheckoutPanel.tsx`, `GET /orders`; pay→fulfil, survives restart |
| Advertising UI | working (demo) | `AdsPanel.tsx`, creative validated, unpaid never serves |
| Admin UI | working | role-aware panel, suspend/reinstate, audit trail |
| Admin + moderation | working | `/admin/*` role-gated, actions audited, suspension persisted |
| App catalog | working (demo connectors) | `apps.mjs`; per-merchant connect, health `demo`, tenant isolated |
| Voice | working (fallback) | `/speak` + browser speech; server provider optional (`SPEECH_*`) |
| Agent knowledge + caps | working | approved-only grounding, per-month request cap, usage recorded |
| Merchant onboarding | working | products, agent config, appearance; validated and persisted |
| Account UI | working | `AuthPanel.tsx` email → code → verified session |
| Identity | working (demo codes) | `auth.mjs` + 007; single-use hashed codes, verify/consume |
| Seed demo merchants | applied | 3 users / 3 merchants / 3 properties / 3 agents |
| Persistence | working | `store.mjs`; orders, properties, campaigns, conversations survive restart |
| Browser runtime | builds, wired to API | `pnpm build` → tsc + Vite, 595 modules; agent chat + confirm UI |
| 3D world | **Milestone 1 live** | district `.blend`, 9 GLB chunks (district 495 kB), 12 markers; validate 12/12 |
| Blender pipeline | working | Blender 5.3.0; M0 7/7 and M1 12/12 validation, exports verified |
| Reference images | present, not visually inspected | `docs/references/` 4 PNG 1672×941, hashes + palette check |
| Merchant AI employees | working (offline provider) | `agent.mjs` + `conversation.mjs`; grounded replies, authorized tools, confirmation gate |
| Paid advertising | state machine + API working (demo) | `server/src/campaigns.mjs`; unpaid campaigns never serve |
| Demo API | working | `PORT=8787 node server/src/index.mjs`; curl smoke-tested |
| Live NervixPay | **blocked** | endpoints/credentials undocumented here |
| Lost Seals quest | working (persisted) | `quests.mjs` + `/progress`; sequential steps, 3 seals, survives restart |
| Multiplayer presence | working (demo) | `presence.mjs` + `usePresence`; 2 clients see each other, leave removes them |
| Ads | schema + state machine | `ad_placements`, `campaigns` tables; `campaigns.mjs` |

## Blocked by an external dependency

1. **Four concept images** — present but not visually inspected (no image input).
3. **NervixPay live docs/credentials** — blocks real payments; demo adapter covers the journey.

## Measured

- App shell: 17.15 kB minified / 5.63 kB gzip; three.js 1168 kB is a lazy chunk loaded on **Enter the city** (was a single 1188 kB chunk).
- FPS is shown live in the status pill but **not yet measured against the 60/30 profiles** — that needs the Blender district.