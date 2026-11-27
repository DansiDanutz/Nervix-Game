# Blender guide

Blender is the source of truth. Everything visual is authored there and exported; the runtime only loads exports.

## Open the project

1. Install Blender 4.x (do not replace an existing install).
2. Open `blender/scenes/nervix_city_district_01.blend`.
3. Textures are relative-path; keep `blender/textures/` beside the file.

## Change a building

1. Open the building source in `blender/assets/buildings/`.
2. Edit the mesh or the Geometry Nodes modifier — the editable node graph stays in the source.
3. Save. The district scene instances/links the asset, so the change appears there.
4. Run **Export** (below).

**Visual change, no app configuration needed.** The merchant assignment, NPC, enabled apps, orders and campaign bookings live in the backend, keyed by stable slot ID — they survive a re-export.

## Add an NPC variant

1. Open `blender/assets/characters/` and duplicate the base rig (do not apply transforms to a bound rig).
2. Swap clothing/hair/skin within the modular attachment rules.
3. Add the variant to the managed collection with a stable `nervix_asset_id`.
4. Export. The backend assigns the agent record to the property; appearance is cosmetic.

## Create an advertisement surface

1. Add a plane/board to the managed collection.
2. Mark it: `nervix_marker_kind = "ad_surface"`, `nervix_slot = "<placement-id>"`.
3. Export. The runtime loads the creative from the backend at runtime — never bake a merchant creative into the city.

## Validate and export

```sh
# validate scale, materials, actions, collision markers
blender --background blender/scenes/nervix_city_district_01.blend \
        --python blender/scripts/validate_scene.py

# export GLBs + manifest.json
blender --background blender/scenes/nervix_city_district_01.blend \
        --python blender/scripts/export_glb.py -- --outdir ../../exports
```

Then copy `exports/*.glb` and `exports/manifest.json` into `app/public/` and run `pnpm dev`.

## Rules

- Metres. Character 1.8 m, doorway 2.1 m, street 6 m, 1 m snap grid.
- Automation touches only the `NERVIX_MANAGED` collection; hand-edited work is never deleted.
- Stable IDs for assets, slots, material slots and animation clips.
- No secrets or customer records in `.blend` files or exports.
- A render is not evidence — validate in the running game.

## Visual vs application configuration

| Change | Where |
|---|---|
| Building shape, materials, lighting | Blender |
| NPC appearance and animation | Blender |
| Ad surface geometry | Blender |
| Merchant name, logo, catalog, ad creative | Backend (runtime) |
| Agent name, tone, knowledge, allowed actions | Backend (runtime) |
| Property assignment, prices, campaigns | Backend (runtime) |