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
| Reference images (4) | **not supplied** | none under `~/Downloads`, `~/Documents`, `~/Desktop`, `~/Documents/ChatGPT` |
| Postgres | not reachable | schema authored, unapplied |
| NervixPay | demo only | no documented endpoints or credentials |

## Current milestone

**Milestone 0 — prove the Blender pipeline.** Blocked on Blender installation.
Unblocked application work is complete and verified (below).

## Done (with evidence)

- Repo created; AGPL-3.0-only; asset policy in `docs/ASSETS.md`.
- Master spec captured: `docs/MASTER_PROMPT.md`. Environment: `docs/ENVIRONMENT.md`.
- `bpy` tooling authored: `blender/scripts/validate_scene.py`, `export_glb.py` (**unexecuted**).
- Backend state machine + provisioning: `server/src/ledger.mjs`, `provision.mjs`.
  - `cd server && node --test test/` → **14 tests, 14 pass, 0 fail**.
  - Covers integer minor units, illegal transitions, duplicate webhook (no double fulfilment), exhausted slots.
- Demo NervixPay adapter: `server/src/nervixpay.demo.mjs` (`DEMO_MODE = true`, labelled simulated).
- Schema: `server/db/migrations/001_init.sql` (users, merchants, properties, agents, products, orders, payments, payment_events, entitlements, campaigns, quests, progress, audit).
- Seed: `server/seed/demo-merchants.mjs` (emits idempotent SQL; no DB to apply it to).
- Browser runtime: `app/` React 19 + TypeScript + Three.js + R3F.
  - `cd app && pnpm build` → `tsc --noEmit` clean, Vite build **593 modules**, 1173 kB / 327 kB gzip.
  - Third-person controller, camera follow, collision bounds, proximity interaction, HUD, quest shell.
  - Boots into a labelled **blockout** until the Blender export exists.
- Docs: `SETUP.md`, `BLENDER_GUIDE.md`, `STATUS.md`, `.env.example`.

## Blockers

1. **Blender is not installed** — blocks Milestone 0 and every visual deliverable.
2. **Four concept images are not on disk** — no visual verification claimed.
3. **No Postgres** — schema and seed are authored but unapplied.
4. **NervixPay live docs/credentials missing** — demo adapter only.

## Next actions

1. Install Blender 4.x, then:
   `blender --background --python blender/scripts/validate_scene.py`
2. Author `nervix_city_district_01.blend` (M0): modular street corner, door, sign surface, rigged character with idle + walk.
3. Export GLB + manifest, copy into `app/public/`, load in the runtime, compare to the written visual direction.
4. Apply the schema to Postgres and seed demo merchants.
5. Add the agent endpoint (text, tool-calling, confirmation before actions) behind the demo provider.
6. Measure frame time on the desktop and mobile profiles; code-split the three.js bundle.

## Conventions

- Metres. Character 1.8 m, doorway 2.1 m, street 6 m, 1 m snap grid.
- Stable IDs: `asset.<kind>.<name>`, `slot.<district>.<n>`, `mat.<name>`, `clip.<name>`.
- Automation touches only `NERVIX_MANAGED`; hand-edited content is never deleted.
- Money is integer minor units; authoritative order state is server-side.
- No secrets or customer records in `.blend` files, exports or git.