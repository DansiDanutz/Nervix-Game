# Nervix World — progress

Maintained after every meaningful milestone. Read this first when resuming.
Omit secrets. Record evidence, not intentions.

## Environment (verified 2026-11-27)

| Capability | State | Evidence |
|---|---|---|
| Repo workspace | ready | `~/Sandbox/deepseek-harness-workspace/nervix-world` |
| Remote | `origin` → github.com/DansiDanutz/Nervix-Game | pushed `4bce72a`, GitHub reports AGPL-3.0, 35 files |
| Licence | AGPL-3.0-only | `LICENSE` (GNU AFFERO GPL v3, 34523 bytes) |
| Node.js | v26.13.0 | `node --version` |
| pnpm | 10.32.1 | `pnpm --version` (needs `--store-dir` inside the workspace; the global store is outside the sandbox) |
| Blender | **missing** | `command -v blender` → guard shim; `/opt/homebrew/bin/blender` does not exist; no `Blender.app` |
| Reference images (4) | **present** | `docs/references/` — 4 PNG, 1672×941, SHA-256 recorded; mapped to ref1–ref4 |
| Postgres | **16.15 at /tmp:5432** | `nervix_world` created; migrations 001–004 applied; seed 3/3/3/3 |
| NervixPay | demo only | no documented endpoints or credentials |

## Current milestone

**Milestone 0 — prove the Blender pipeline.** Blocked on Blender installation.
Unblocked application work is complete and verified (below).

## Done (with evidence)

- Repo created; AGPL-3.0-only; asset policy in `docs/ASSETS.md`.
- Master spec captured: `docs/MASTER_PROMPT.md`. Environment: `docs/ENVIRONMENT.md`.
- `bpy` tooling authored: `blender/scripts/validate_scene.py`, `export_glb.py` (**unexecuted**).
- Backend state machine + provisioning: `server/src/ledger.mjs`, `provision.mjs`.
- Merchant AI employee rules: `server/src/agent.mjs` — approved-knowledge grounding, per-merchant tool authorization, confirmation before checkout/support, player text treated as untrusted data.
- Conversational agent: `server/src/provider.mjs` (offline `localProvider` + replaceable OpenAI-compatible `remoteProvider`) and `server/src/conversation.mjs` (grounded replies, server-side tool execution, cart totals recomputed from the catalog, confirmation gate).
  - API smoke test: "what time do you open?" → "We open at 08:00 and close at 20:00." (1 citation); unknown question → offers support, invents nothing; `open_app` denied; confirmed checkout → order `ord_1` 900 EUR `created`, checkout `awaiting_payment`.
- Paid campaigns: `server/src/campaigns.mjs` — draft→awaiting_payment→scheduled→active, pause/resume, expiry, exclusive-placement conflict detection, servable only when paid and in period.
- Lost Seals quest: `server/src/quests.mjs` (pure) + `/quests/lost-seals`, `/progress`; migration 001 patched with `seals`, seed inserts the quest.
  - Sequential steps, unique seals, no purchase required; progress persists per user.
  - Live: skip → `out_of_order`; step1-3 → advance; seal before step → `seal_locked`; collect → 1 seal; replay → `already_collected`; **step 3 + seal survive restart**.
  - Client: HUD seal counter, **E** collects a nearby seal marker.
- Advertising UI + creative validation: `AdsPanel.tsx`, `GET /placements`, `GET /campaigns`.
  - Creative text ≤120 chars, hex colour, https image; unpaid campaigns never serve.
  - Live: create → `draft`; unpaid `servable False`; request-payment → pay → tick → `servable True cmp_live` with creative.
  - `pnpm build` green; tests **76/76**.
- Admin + moderation: migration `010_moderation`, store admin/audit, `/admin/*` routes.
  - Role checked server-side; every admin action writes `audit_events`.
  - Live: non-admin → `forbidden`; admin lists 4 merchants; suspend mer_1 → `suspended true`; audit shows `('merchant.suspend','mer_1')`.
- App integration catalog: `apps.mjs`, store connect/list/disconnect, seed 3 apps.
  - Config validated per app; demo connectors always report `demo`; credentials never returned.
  - Live: missing field → `AppError`; connect → `health demo`; only `booking` connected for mer_1; **mer_2 sees none** (tenant isolation); disconnect works.
- Agent knowledge + metering: `usage.mjs`, knowledge routes, migration `009_usage` (+ `monthly_request_cap`).
  - Unapproved knowledge is never used; approved content grounds the answer; cap blocks further inference (`cap_reached`); usage recorded per month.
  - Live: unapproved → "I don't have that information"; approved → "The rooftop is open on Fridays at 19:00."; cap 1 → `cap_reached`; usage row `2026-11 2`.
- Checkout + order history: `CheckoutPanel.tsx`, `GET /orders?buyerId=`, demo pay/fulfil.
  - Fixed id generation (`ord_1` collided with persisted rows) → unique `ord_<time>_<seq>`.
  - Live: order 750 EUR → paid → fulfilled; list empty before, `[(ord_…, fulfilled)]` **after restart**.
- Merchant onboarding: `server/src/merchants.mjs` (validators) + product/agent/appearance routes; migration `008_property_palette`; `MerchantPanel.tsx` in the client.
  - Prices are integer minor units; templates, tones, languages and tools are whitelisted; agent config upserts.
  - Live: float money → `MerchantError`; unknown tool → `MerchantError`; appearance `cafe_shop/#123456` persisted; agent `Sana/warm/en+ro` persisted; `pnpm build` green.
- Admin UI: `AdminPanel.tsx` (suspend/reinstate + audit); `/auth/verify` now returns the real DB role so admins are recognised.
  - Live: admin login → `role admin`, `verified true`; 4 merchants listed; suspend mer_2 persisted; audit shows two `merchant.suspend` actions; `pnpm build` green.
- Refunds: ledger `refund()` (paid/fulfilled → refunded, once), `POST /orders/:id/refund`, Refund button in Orders; migration `011_refunds` allows the state.
  - Live: paid → `refunded` with reason; double refund → `TransitionError`; **persists as `refunded` after restart**; tests **79/79**.
- Performance: manualChunks (three/react) + lazy `SceneView` behind an **Enter the city** gate; `PerfMeter` reports measured FPS in the status pill.
  - Before: one 1188 kB chunk (331 kB gzip). After: shell **17.15 kB (5.63 gzip)**, SceneView 4.65 kB, three 1168 kB loaded only on entry.
  - FPS is measured, not claimed: the 60/30 profiles need the Blender district.
- Account UI: `app/src/ui/AuthPanel.tsx` — email → demo code → verified session; updates HUD and quest.
  - `pnpm build` green after adding `verified?: boolean` to the client Session type.
- Verified email identity: `server/src/auth.mjs` (pure code logic) + `/auth/signup`, `/auth/login`, `/auth/verify`; migration `007_verification` applied.
  - Codes are 6 digits, hashed (SHA-256) at rest, single-use, 10-minute expiry.
  - Live: signup → `devCode`; wrong code → `mismatch`; correct → `verified true`; replay → `already_used`.
- Shared presence: `server/src/presence.mjs` (ws) + `app/src/net/presence.ts`, `RemotePlayers`.
  - `node --test test/` → **64 tests, 64 pass, 0 fail** (auth, presence, quests, ledger, provisioning, campaigns, agent).
  - Live: two clients join → both see each other; move → `x=5 z=-2` broadcast; leave → removed. Public position only.
- Runnable demo API: `server/src/index.mjs` (node:http, in-memory or Postgres, zero deps beyond pg/ws).
  - API smoke test: provision→created, retry→`created:false`; order total 750 EUR; `payment_created`→pending_payment; `payment_succeeded`→paid; replay→paid (no double fulfil); fulfil→fulfilled; unauthorized `open_app` denied; campaign awaiting_payment→scheduled→active→servable `True cmp_now`; unpaid placement `servable False`.
- Demo NervixPay adapter: `server/src/nervixpay.demo.mjs` (`DEMO_MODE = true`, labelled simulated).
- Schema: `server/db/migrations/001_init.sql` plus `002_text_ids`, `003_users_text`, `004_merchants_text` (stable text ids), all **applied** to `nervix_world`.
- Persistence: `server/src/store.mjs` (pg). With `DATABASE_URL` set, orders, properties, users, merchants, **campaigns and conversations** persist.
  - Verified: order → `paid` in DB, read back after restart; campaign `cmp_pg` servable after restart; conversation history 1 → 2 turns after restart.
  - Migrations `005_conversations`, `006_campaigns_text` applied.
- Seed: `server/seed/demo-merchants.mjs` → 3 users, 3 merchants, 3 properties, 3 agents (apostrophe-safe, idempotent).
- Browser runtime: `app/` React 19 + TypeScript + Three.js + R3F.
  - `cd app && pnpm build` → `tsc --noEmit` clean, Vite build **595 modules**, 1176 kB / 328 kB gzip.
  - Third-person controller, camera follow, collision bounds, proximity interaction, HUD, quest shell.
  - Wired to the API: session, property provisioning, catalog, agent chat with confirmation UI; CORS enabled on the server; status pill shows connected/offline.
  - Boots into a labelled **blockout** until the Blender export exists.
- Docs: `SETUP.md`, `BLENDER_GUIDE.md`, `STATUS.md`, `.env.example`.
- Four concept images filed: `docs/references/ref1..ref4`, with mapping, hashes and palette check (`docs/references/README.md`). **Not visually inspected** — no image input in this session.

## Blockers

1. **Blender is not installed** — blocks Milestone 0 and every visual deliverable.
2. **No Postgres** — schema and seed are authored but unapplied.
3. **NervixPay live docs/credentials missing** — demo adapter only.

## Next actions

1. Install Blender 4.x, then:
   `blender --background --python blender/scripts/validate_scene.py`
2. Author `nervix_city_district_01.blend` (M0): modular street corner, door, sign surface, rigged character with idle + walk.
3. Export GLB + manifest, copy into `app/public/`, load in the runtime, compare to the written visual direction.
4. Apply the schema to Postgres and seed demo merchants.
5. Point `AGENT_MODEL_BASE_URL` / `AGENT_MODEL_KEY` at a provider to replace the offline `localProvider`; add voice when configured.
6. Measure frame time on the desktop and mobile profiles; code-split the three.js bundle.
7. Add indexes/backups and move the remaining demo-only bits (session) behind real identity.

## Conventions

- Metres. Character 1.8 m, doorway 2.1 m, street 6 m, 1 m snap grid.
- Stable IDs: `asset.<kind>.<name>`, `slot.<district>.<n>`, `mat.<name>`, `clip.<name>`.
- Automation touches only `NERVIX_MANAGED`; hand-edited content is never deleted.
- Money is integer minor units; authoritative order state is server-side.
- No secrets or customer records in `.blend` files, exports or git.