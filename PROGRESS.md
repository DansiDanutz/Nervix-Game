# Nervix World — progress

Maintained after every meaningful milestone. Read this first when resuming.
Omit secrets. Record evidence, not intentions.

## Environment (verified 2026-11-27)

| Capability | State | Evidence |
|---|---|---|
| Repo workspace | ready | `~/Sandbox/deepseek-harness-workspace/nervix-world` |
| Licence | AGPL-3.0-only | `LICENSE` (GNU AFFERO GPL v3, 34523 bytes) |
| Blender | **missing** | `command -v blender` → guard shim; `/opt/homebrew/bin/blender` does not exist; no `Blender.app` |
| Reference images (4) | **not supplied** | no matching files under `~/Downloads`, `~/Documents`, `~/Desktop` |
| Node/pnpm | not checked yet | — |
| NervixPay integration | not started | demo adapter required until docs/credentials exist |

## Current milestone

**Milestone 0 — prove the Blender pipeline.** Blocked on Blender installation.

## Done

- Repo created, AGPL-3.0-only licence applied.
- Master prompt captured as a structured spec: `docs/MASTER_PROMPT.md`.
- Asset and reference policy recorded: `docs/ASSETS.md`.
- Environment inspected and recorded: `docs/ENVIRONMENT.md`.
- `bpy` scripts authored for scene validation and GLB export (unexecuted).

## Blockers

1. **Blender is not installed.** Needed before any `.blend` can be produced or validated.
2. **The four concept images are not on disk.** The prompt's reference table (city overview, merchant buildings, character lineup, café interior) cannot be inspected. Written descriptions are used instead; no visual verification is claimed.

## Next actions

1. Install Blender 4.x (or point `blender` at an existing build) and re-run `blender --background --python blender/scripts/validate_scene.py`.
2. Author `nervix_city_district_01.blend`: modular room/street corner, door, merchant sign surface, one rigged character with idle + walk.
3. Export GLB, write the scene manifest, load it in the runtime viewer, and compare against the written visual direction.
4. Only then expand to the full district.

## Conventions

- Scale in meters. Character height 1.8 m, doorway 2.1 m, street width 6 m, 1 m snapping grid.
- Stable IDs for assets, slots, material slots, animation clips.
- Hand-edited content is never deleted by automation; scripts touch managed collections only.
- No secrets, credentials, or customer records in `.blend` files or exports.