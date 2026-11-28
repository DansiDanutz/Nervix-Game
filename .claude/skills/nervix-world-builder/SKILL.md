---
name: nervix-world-builder
description: Build or change Nervix World environments with Blender (bpy scripts or MCP for Blender) exported to the React Three Fiber game, and prove the result against the reference art. Use for any scene, building, lighting, camera or arrival work in this repo.
---

# Nervix World builder

Improve this skill after every milestone: add what worked and what failed, and delete rules that turned out wrong.

## Sources of truth
- **Art:** `assets/references/` holds 23 PNGs (see `SHA256SUMS`). A01-plaza controls the street arrival. A16–A18 control OpenPoker. ref1 supports A01 but never replaces it.
- **Supporting, local only:** pedestrian walkthroughs live in `docs/references/external/` (gitignored, third-party). Notes are in `docs/art-direction/pedestrian-walkthrough-reference.md`. Study them for eye-level readability. Never copy their assets.
- **Geometry and look:** Blender is the source of truth. The browser renders the exports.
- **Identity:** merchant names, catalogues and profiles load at runtime from the server. Never bake them into Blender.

## Quality bar and pipeline
- Fidelity target: `docs/art-direction/target-quality-reference.md` (David: "exactly the result I want"). Design target is still A01–A18.
- Pipeline per area: plan → gray box approved at the game camera → asset kit (each asset checked against its A-reference by a reviewer) → assemble → playtest on foot (fps, hitches) → judged reference | Blender | game comparison.
- For browser fidelity: PBR textures and bevels; lighting and AO baked in Cycles to lightmaps; HDRI/sky; ACES tone mapping; light SSAO and bloom; instancing; KTX2.
- Higgsfield or other paid generation only when David starts that job.

## Blender rules
- Never save `blender/scenes/nervix_city_district_01.blend`; check its sha256 before and after. Work in `blender/scenes/nervix_city_slice_01.blend` or another copy.
- Keep the scene reproducible: modular scripts in `blender/scripts/` (`arrival_*.py`, `openpoker_*.py`), each under 400 lines, with idempotent builders that delete and rebuild only their own collection.
- MCP for Blender (local scope, telemetry off) is good for live inspection and quick edits in the open GUI. Anything you keep must also exist in a script, so a fresh checkout rebuilds it.
- One owner per set of scene files. Never let two agents edit the same scripts or .blend at once. Never SendMessage a running Workflow subagent; it starts a duplicate.
- Coordinates: Blender (x, y, z) maps to runtime (x, z, −y). Facing −x in the game, screen-left is runtime +z, which is Blender −y.

## Export contract
- glTF GLB without Draco, under 8 MB and 350k triangles per chunk. Name the meshes that tests look for (for example `fountain*`).
- `app/public/slice/manifest.json` carries `runtime_layout`: doors, spawns, bounds, obstacles, `replaces_chunks` and lighting. Merge new fields and never drop old ones. Validate with `parseSliceManifest` (`app/src/scene/slice.ts`, `slice.test.ts`).
- The client must never draw both an old chunk and the export that replaces it.

## Camera and arrival
- The first view is pedestrian eye level on the east street, facing Fountain Square. The game camera settles at about (21.98, 1.98, −0.70) looking at (13, 1.52, −0.70), with 55° vertical FOV.
- Give the Blender camera `CAM_arrival_spawn` the same pose, so renders and the game are comparable.
- Nothing above eye level may cross the view from the spawn to the fountain. The avatar stays in the lower-left third.

## Three.js side
- Read `~/.claude/skills/threejs-lighting`, `threejs-materials` and `threejs-textures` before tuning colour space, tone mapping, shadows or fog. Match the Blender render, not taste.

## Proof (required before claiming a visual milestone)
1. Run the tests. Server: `cd server && node --test`. App: `cd app && pnpm exec tsc --noEmit`, then `node --test src/**/*.test.ts`.
2. Run E2E on the GPU: `cd app && PW_GL=metal PW_CHROMIUM_PATH=<cached chrome-headless-shell 1243> node e2e/prepare-db.mjs && pnpm exec playwright test`. Ports 28797 and 25183 are ours. Ports 8787 and 18787 belong to other services; never stop them.
3. Enter as a fresh player through the normal gate and capture the first settled frame before moving: `docs/evidence/slice/game-arrival-first-frame.png`.
4. Make the strip: reference | Blender render | game frame, saved in `docs/evidence/slice/compare-*.png`. Look at it. Use independent judges for sign-off. Report gaps honestly; never claim a match to an unseen image.
