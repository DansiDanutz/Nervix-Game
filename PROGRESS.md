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
- Runnable demo API: `server/src/index.mjs` (node:http, in-memory, zero deps).
  - `cd server && node --test test/` → **41 tests, 41 pass, 0 fail**.
  - API smoke test (curl, port 8787/8788): provision→created, retry→`created:false`; order total 750 EUR; `payment_created`→pending_payment; `payment_succeeded`→paid; replay→paid (no double fulfil); fulfil→fulfilled; unauthorized `open_app` denied; campaign awaiting_payment→scheduled→active→servable `True cmp_now`; unpaid placement `servable False`.
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