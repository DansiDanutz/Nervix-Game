# Asset and reference policy

## Licence split

| Asset class | Licence | Notes |
|---|---|---|
| Source code, `bpy` scripts, app, backend | **AGPL-3.0-only** | `LICENSE` at repo root |
| 3D models, textures, materials, animation | **CC BY 4.0** (recommended) | Must be declared in `ASSET_CREDITS.md` before publishing |
| Music, voice, sound effects | **CC BY 4.0** or CC0 | Keep provenance and model/provider records |
| Merchant logos, creatives, ad copy | **Third-party** | Loaded dynamically; never relicensed by this repo |

The AGPL covers code, not art. Without an explicit asset licence, art defaults to "all rights reserved" even inside an AGPL repo.

## Reference images

The master prompt supplies four concept images. **None were found on disk or in the ChatGPT project folder**, so none were inspected.

| Ref | Subject | Status |
|---|---|---|
| 1 | City overview | not inspected |
| 2 | Merchant building concepts | not inspected |
| 3 | Character lineup | not inspected |
| 4 | Café interior | not inspected |

Until they are supplied, build from the written descriptions in `MASTER_PROMPT.md` §2 and claim no visual verification.

## Asset conventions

- Meters. Character 1.8 m, doorway 2.1 m, street 6 m, 1 m snap grid.
- Stable IDs: `asset.<kind>.<name>`, `slot.<district>.<n>`, `mat.<name>`, `clip.<name>`.
- Managed collections only; automation never deletes hand-edited objects.
- No secrets, credentials or customer records in `.blend` files or exports.
- Merchant names/logos/catalogs/ad creatives load at runtime into prepared surfaces.