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

The four concept images are now filed in [`references/`](references/README.md) with a reference-to-file mapping and SHA-256 hashes.

| Ref | Subject | Status |
|---|---|---|
| 1 | City overview | present, mapped — **not visually inspected** (no image input in session) |
| 2 | Merchant building concepts | present, mapped — not visually inspected |
| 3 | Character lineup | present, mapped — not visually inspected |
| 4 | Café interior | present, mapped — not visually inspected |

Palette was verified programmatically (warm sandstone/terracotta/cream in all four). No composition or material claim is made from looking at them. Build from the written descriptions in `MASTER_PROMPT.md` §2 plus these files, and claim no visual verification until a reviewer with image input signs off.

## Asset conventions

- Meters. Character 1.8 m, doorway 2.1 m, street 6 m, 1 m snap grid.
- Stable IDs: `asset.<kind>.<name>`, `slot.<district>.<n>`, `mat.<name>`, `clip.<name>`.
- Managed collections only; automation never deletes hand-edited objects.
- No secrets, credentials or customer records in `.blend` files or exports.
- Merchant names/logos/catalogs/ad creatives load at runtime into prepared surfaces.