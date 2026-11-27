# Reference images

The four concept images supplied for Nervix World, filed under the reference numbers used in
[../MASTER_PROMPT.md](../MASTER_PROMPT.md) §2.

| Ref | File | Original name in `~/Downloads` | Intended use |
|---|---|---|---|
| 1 | `ref1-city-overview.png` | `Sunlit Merchant City Fountain Plaza.png` | Overall composition, central fountain plaza, landmark hierarchy, sandstone, terracotta, arches, vegetation |
| 2 | `ref2-merchant-buildings.png` | `Three Mediterranean Merchant City Buildings.png` | Reusable house/storefront, café, casino-themed venue; silhouettes, entrances, sign positions, materials |
| 3 | `ref3-character-lineup.png` | `Nervix World Character Lineup.png` | Player, merchant, café employee, entertainment host; proportions, faces, clothing roles |
| 4 | `ref4-cafe-interior.png` | `Welcoming sandstone café interior.png` | Counter, seating, materials, arches, circulation, lighting, interaction area |

## Integrity

All four are 1672×941 RGB PNG.

```
c655d9d110e75831429cffea03b9ff3e6028968ed0d8c860aebbe44987a0bc30  ref1-city-overview.png
2a9591b60bef9591442562125578b23be86139449dabc9635e985d3548807ca2  ref2-merchant-buildings.png
5c7b30dff931a113b23bb6c9c9329456dc20cbdc4d813a1df41c225ae4efd2af  ref3-character-lineup.png
3983df7acf869cd58eab43b0ecc96353e689ba52e77be04f4ab3ea2f8ab0d783  ref4-cafe-interior.png
```

## Inspection status

**Not visually inspected.** The agent in this session has no image input, so no composition,
silhouette or material claim is made from looking at them. What was verified programmatically:

- files exist, are readable PNGs, 1672×941;
- dominant palette sampled by median-cut quantisation is warm sandstone / terracotta / cream
  in all four, consistent with the written direction (sandstone, cream stone, terracotta).

Treat the images as concepts for silhouette, materials, colour and atmosphere — not meshes,
blueprints, topology guides or proof of layout. Resolve scale and construction in Blender with
the measured conventions in [../../BLENDER_GUIDE.md](../../BLENDER_GUIDE.md).

## Provenance

AI-generated concept images supplied by the project owner. Record them in `ASSET_CREDITS.md`
before publishing; they are not covered by the AGPL code licence.