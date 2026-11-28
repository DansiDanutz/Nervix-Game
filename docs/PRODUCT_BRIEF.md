# Product brief — merchant city, first playable slice

Recorded 2026-11-28 from David's handoff. Governs the `feat/merchant-city-slice` work; the master
spec (`MASTER_PROMPT.md`) still governs everything it does not override.

## What the city is

- Players are **NervixPay users** exploring a discoverable city in the browser: keyboard movement,
  mouse look, mouse interaction.
- **Buildings represent verified NervixPay merchants.** A house is bound to one merchant record.
- Each eligible merchant personalises **their own** house: welcome text, decor, display and
  catalog, and can offer their own app, website and products inside it.

## Authority rules (server-enforced)

1. Only a **verified merchant** can add or customise business content.
2. A merchant may edit **only their own house**. Cross-owner edits are rejected server-side.
3. Existing account/subscription eligibility is respected. **A subscription alone never grants
   merchant authority.**
4. Visitors are read-only.
5. Merchant identity and catalog load **at runtime**; no real merchant data is baked into Blender.
6. No production changes, real payments or wagers in this slice.

## Visual rules

- Blender is the visual source of truth. Work happens in a **new scene copy**; the original
  `nervix_city_district_01.blend` is not overwritten.
- Match the selected references' composition, architecture, materials and light (A16 doorway, A17
  salon, A18 roulette table; ref1–ref4 for the plaza). Compare the actual Blender render and the
  actual browser frame against the targets, side by side.
- Do not call the city complete from a prototype.

## First playable slice

`plaza → OpenPoker → DanGG → plaza`, with the independent **Test Builder** house preserved.

Tests (fixtures, no production data):
- normal mouse + keyboard navigation along the route;
- visitor read-only permissions;
- owner edit of their own house succeeds;
- edit of another owner's house is denied;
- subscription-only account cannot edit.

Deliverable evidence includes **A17 beside the actual doorway Blender render and the game
screenshot**.
