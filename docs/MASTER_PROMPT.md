# Nervix World — master specification

Structured from the ChatGPT-prepared master prompt (`Nervix_World_Master_Prompt.md`, supplied in-session 2026-11-27). This is a faithful condensation, not the verbatim text; the prompt's own wording governs where they differ.

**Defining experience:** enter a beautiful ancient city, explore as your character, walk into a real merchant's property, talk to their AI employee, understand or use a connected service, and complete a clearly confirmed purchase through NervixPay.

**Production requirement:** the entire visual world can be opened, built and edited in Blender, and those changes reliably reach the playable platform.

## 1. Blender-first production (mandatory)

Blender is the source of truth for every 3D asset: city layout and terrain, streets, plazas, bridges, canals, buildings and interiors, player characters, merchant NPCs, clothing/hair/accessories, furniture, vegetation, props, materials and textures, rigs, facial expressions and animations, interaction markers and placement.

Three cooperating layers:

| Layer | Responsibility |
|---|---|
| Blender | Author every 3D asset, assemble districts, animate, place interaction markers |
| Playable runtime | Load exports; movement, cameras, collision, animation, multiplayer, interfaces |
| Platform backend | Email identity, NervixPay, merchants, app permissions, AI conversations, orders, ads |

Deliver native editable `.blend` files throughout. A render or an exported model alone does not satisfy the source requirement. Temporary blockouts need an explicit replacement path.

## 2. Visual direction

An inviting ancient trading city in a polished **Pixar-style 3D animated film** look: warm sandstone and cream stone, terracotta roofs, sculpted arches, marble fountains, cobbled streets, teal awnings, painted wood, restrained plum and brass accents, ivy, olive trees, courtyard vegetation, timber beams and lanterns.

The player starts at a central fountain with several destinations visible. Landmarks, silhouettes, readable signs and attractive paths invite exploration. Merchant branding is integrated as tasteful ancient-style shop signs and banners, with configurable templates, sign locations, colours and decoration limits.

### Reference-image guide (as supplied)

| Reference | Intended use |
|---|---|
| 1 — City overview | Composition, fountain plaza, landmark hierarchy, sandstone, terracotta, arches, vegetation |
| 2 — Merchant building concepts | Reusable house/storefront, café, casino-themed venue; silhouettes, entrances, sign positions, materials |
| 3 — Character lineup | Player, merchant, café employee, entertainment host; proportions, faces, clothing roles |
| 4 — Café interior | Counter, seating, materials, arches, circulation, lighting, interaction area |

These are concepts for silhouette, materials, colour and atmosphere — not meshes, blueprints, topology guides or proof of layout. **None of the four images were available locally; they were not inspected.**

## 3. Blender organisation and automation

Separate source files for reusable assets, linked or instanced into district scenes, with asset catalogs, descriptive collections, reusable materials and relative texture paths. Package external dependencies.

`bpy` tooling must operate on explicitly managed collections, preserve hand-edited work, update generated objects predictably, use stable IDs and seeded procedural generation, never delete the whole scene, and never duplicate buildings on re-run. Geometry Nodes stay editable in source; bake only export copies.

## 4. The first city

Districts: Central Plaza (arrival, fountain, guide, map, intro quest), Merchant Quarter, Coffee Courtyard, Entertainment District (casino-themed venue), App Arcade, Merchant Guild.

Build one compact, richly detailed district first. Meters as scale. Measured reference character and doorway before expanding the kit. Every property template needs entrance/exit anchors, signage surfaces, NPC stations, product-display points, app interaction anchors, camera-safe interaction areas and simple collision.

Stable property and advertising slots live in the Blender district; the backend assigns merchants to slots. **A new signup must not require Blender or a city re-export.**

## 5. Characters, rigs, animation

Consistent proportions, expressive original faces, shared humanoid rig where practical, modular clothing/hair/skin/accessories with defined attachment rules and clipping tests.

Named actions: idle, walk, run, greet, talk gestures, listen, sit, stand, point/guide — with looping, transitions and a consistent root-motion policy. Keep the animator-friendly rig in source; export the supported skeleton and baked clips. Never blindly apply transforms to a bound rig.

Shape keys for expressions and blinks; speech shapes when voice exists, with a fallback talking animation. Test one character early before producing variants. NPC appearance/animation are Blender assets; knowledge, personality, dialogue, movement decisions and tool permissions belong to runtime/backend.

## 6. Export contract

Verified **glTF 2.0/GLB** pipeline. Export buildings, characters, interiors and district chunks separately for incremental updates and progressive loading. Deliver `.blend` sources alongside exports. Bake procedural detail where needed while keeping the editable node setup.

Validate exports in the real viewer — a beautiful Blender render is not evidence. Document supported/unsupported features; never assume arbitrary shader nodes, Geometry Nodes, constraints, drivers, simulations or scripts run in the runtime.

Preserve stable asset IDs, instance/slot IDs, material slots and animation clip names. Export a schema-versioned manifest (asset references, placements, entrances, spawn points, colliders, NPC stations, app anchors, signage, ad surfaces). One tested coordinate-conversion path.

Merchant names, logos, catalogs and ad creatives load dynamically into prepared surfaces. Editing and re-exporting a café must preserve its merchant assignment, NPC, app links, orders and ad bookings. Flag incompatible structural changes for deliberate migration.

## 7. Accounts, avatars, properties

Verified email registration/login linked securely to the user's NervixPay identity through its actual supported integration. Reuse existing project auth where available. Matching emails alone must never grant access to an existing NervixPay account.

Every account gets a persistent customizable avatar. Allocation:

| Account type | Initial allocation |
|---|---|
| Ordinary user | Customizable player character |
| General merchant / service provider | Character, house/storefront, AI employee |
| Café / hospitality merchant | Character, coffee shop, AI employee |
| Gaming merchant | Character, casino/entertainment venue, AI employee |

Provisioning must be persistent and idempotent — retries and repeated logins create no duplicates. Reserve the property at registration; publish business content when setup completes. Roles: player, merchant owner, merchant staff, platform admin. Ownership and permissions checked server-side; public display names in-world, emails private.

## 8. Gameplay and navigation

Third-person controller: walk, run, smooth camera rotation, collision, interaction prompts, animated states. Keyboard/mouse, touch, adjustable sensitivity. Enter buildings, sit in cafés, interact, return to city.

Minimap, searchable world map, navigation markers, quest journal, inventory, avatar customization, saved progress, searchable merchant directory and direct service access.

Original intro adventure **The Lost Seals of the City**: recover three ceremonial seals via exploration, a simple environmental puzzle and conversations; introduces café, merchant quarter and entertainment venue.

Loop: **discover a place → meet a character → complete a small challenge → learn something useful → unlock a cosmetic or exploration achievement.** Basic completion must not depend on a purchase or a paid ad. Adventure rewards stay separate from money.

Shared multiplayer presence: see other players in the same district, emotes, public spaces. Merchant conversations private by default. Configurable room capacity; measure practical limits rather than promising unlimited players.

## 9. Merchant AI employees

A persistent in-world NPC per merchant, labelled with name, merchant affiliation and AI representative status. Suitable appearance, profession, idle behaviours, gestures, small movement area. Text conversation; optional push-to-talk and spoken replies with mic permission, captions, mute and text fallback. The agent can guide the player to a counter, display or app entrance.

Merchant configures name, appearance, tone, languages, business information, approved knowledge sources and allowed actions. Ingest FAQs, product docs, service guides, pricing, hours, support policies, catalog data. English and Romanian first.

Agents answer what the business sells and which option fits, how to use a product/app, current price/availability/schedule, how to buy or book via NervixPay, and where to find a purchase or get help — grounded in approved information, querying authorized live tools, showing relevant links, and explaining gaps instead of inventing answers.

Server-authorized tools: search catalog, read product details, retrieve instructions, inspect the current user's eligible order, prepare a cart/booking, create a checkout request, open an enabled app, request human support. Confirmation required before acting on the user's behalf.

Player messages, uploaded documents and app responses are untrusted: they cannot grant permissions, change payment destinations, reveal credentials or cross merchant boundaries. The model never decides whether a payment succeeded or an entitlement exists. NPC animation is independent of inference. Start model/voice calls only when needed, reuse approved answers, expose usage limits and cost controls, keep providers replaceable.

## 10. App integration catalog

Shared catalog available to every merchant: ID, name, description, category, visual entry point, integration method, auth requirements, permissions/actions, configuration fields, health status. Merchant-specific configuration and credentials stay with that merchant.

Support authorized server API integrations, secure embedded interfaces where permitted, and approved external launch flows. Always provide a consistent way back to the city. Preserve identity/merchant context only through documented delegation.

In-world representations: booking desk, product display, service counter, game table, workshop, portal. Opening one reveals a usable interface; the agent explains it. Public discovery with tenant separation for private conversations, records, orders, credentials and operational data. Cross-merchant public listings are fine; private tools need permission. Unavailable apps show a clear state, preserve place, allow retry. Demo connectors are labelled and never described as live.

## 11. NervixPay integration

Inspect the real codebase and authoritative docs first. Identify supported auth/account linking, merchant IDs, payment creation, status verification, notifications, currencies, refunds. **Do not invent endpoints, SSO, currencies, fees, balances or settlement behaviour.** Server-side adapter; explicitly labelled demo adapter with simulated outcomes if docs/credentials are missing, plus the exact inputs still needed. Keep demo and production config separate.

Purchase journey: choose product/service → server creates order from authorized merchant data → player reviews merchant, item, quantity, currency, total, fees, fulfilment, terms → explicit confirmation and supported NervixPay flow → server verifies via the documented trusted mechanism → order updated, receipt issued, fulfilment/entitlement triggered. One merchant per checkout at first.

Distinguish digital access, appointments, physical delivery and local pickup; collect only what the fulfilment method needs. Authoritative order/payment state stays server-side. Validate payee, order, amount, currency; use exact monetary representations, idempotency and duplicate-event handling. Handle pending, failed, cancelled, expired, late confirmations and supported refunds. A redirect or an agent's statement is never proof of payment. NPCs never silently charge. Settlement and ad revenue stay attributable. Reconciliation and audit trail without exposing secrets client-side.

## 12. Paid advertising

Ads are a product bought through NervixPay: wall posters, cloth banners, plaza noticeboards, sponsored directory positions, venue displays, clearly identified sponsored events/recommendations. Ordinary signage identifies a business; promotional visibility is a labelled paid campaign.

Merchant selects placement, uploads/composes creative, previews in-world, chooses dates, checks availability, reviews price, pays. Fixed-price placements for a period to start; later performance billing configurable. Do not invent fees or a token economy.

States: draft, awaiting payment, scheduled, active, paused, expired, cancelled. Publish only when checks pass and payment is verified. Prevent overlapping exclusive bookings; handle lapsed reservations and late payments. Stop serving when the period or budget ends. Renewal is explicit. Merchants can pause and see placement, dates, spend, engagement and attributable orders. Count impressions only when actually visible under a documented rule; filter repeated/automated events. Ad measurement stays separate from private conversation content; no undisclosed promotions inside agent answers.

## 13. Merchant and platform management

Merchant workspace (from the property and a dashboard): business profile, property appearance, catalog and fulfilment, enabled apps, NPC configuration and knowledge sources, support requests, orders, advertising, usage reporting.

Platform admin: merchant accounts, property assignment, districts, building templates, app registration, permissions, campaign pricing and review, moderation, integration health, audited admin actions. Previews before publication. Merchants see which knowledge sources and integrations are active, unavailable or demo.

## 14. Implementation foundation

Blender mandatory. Browser runtime by default: TypeScript, React, Three.js, React Three Fiber, stable verified versions. Backend for auth, permissions, provisioning, agent tools, connectors, orders, payments, campaigns, background jobs. Relational database for persistent records. Realtime transport for presence/movement with authoritative server checks for consequential actions.

Records: users, external account links, avatars, merchants, memberships, properties, districts, agent configs, knowledge sources, conversations, apps, merchant app connections, products, orders, payments, entitlements, ad placements, campaigns, quests, progress, audit events — all carrying ownership through relationships and queries.

Keep rendering, realtime movement, conversation generation and payment processing separated so a slow agent or provider cannot freeze the city. Derive game-ready meshes, LODs and texture variants from Blender source. Measure triangles, vertices, material counts, draw calls, texture memory and download size. Use instancing, culling, progressive loading; prioritise a responsive first area. Define desktop and mobile profiles; aim 60 FPS desktop / stable 30 FPS mobile and **report measurements**. Loading, reconnecting, offline, unsupported graphics and unavailable integration states. Adjustable graphics, readable text, keyboard-accessible panels, reduced motion, captions. Private keys and service credentials server-side only.

## 15. Economy boundaries

NervixPay's verified methods for commercial purchases and advertising. Adventure XP, cosmetics, collectible seals and demo chips are distinct from money and balances. The first casino venue is social/play-money only plus a connector for approved gaming apps. No cash wagering, deposits, withdrawals, tradable land, NFTs or new currency. Future commercial rules are explicit configuration decisions.

## 16. Build sequence

- **M0 — prove the pipeline:** editable Blender sample with a modular room/street corner, a door, a merchant sign surface, one rigged character with idle + walk. Validate scale, collision metadata, materials, animation and dynamic signage in the runtime. Change one asset in Blender and re-export successfully.
- **M1 — first district and playable experience:** `nervix_city_district_01.blend` with plaza, street, fountain, merchant house, café, casino exterior, one working interior, customizable player base, three NPC variants, source materials/textures, modular props, collision and interaction markers, an ad placement, stable IDs, export scripts, generated GLBs, manifest — wired to verified email or a clearly separated local demo login, saved progress, third-person exploration, intro quest, a demo app connector, sandbox checkout, basic multiplayer presence and merchant provisioning.
- **M2 — operational connections:** documented NervixPay services, real merchant catalogs, merchant self-service, knowledge ingestion, app configuration, fulfilment, support, paid campaign scheduling, voice when configured. Label live vs simulated.
- **M3 — expansion:** more districts, quests, animation, templates, apps, social features, seasonal events, measured scaling.

## 17. Acceptance criteria

1. New user signs in, creates an avatar, explores, returns with saved progress.
2. A merchant gets exactly one appropriate property and agent; retries create no duplicate.
3. Two sessions see each other without sharing private merchant conversations.
4. The intro adventure is completable without a purchase.
5. Each agent answers from its own merchant information, flags gaps, respects permissions.
6. An enabled app opens in the correct user/merchant context; unauthorized connections are rejected.
7. A purchase reaches verified payment and the right receipt/entitlement; duplicate notifications do not duplicate fulfilment.
8. Pending/failed/cancelled/expired/late payments produce accurate states.
9. An ad can be previewed, bought, scheduled, displayed and expired; unpaid campaigns never serve.
10. Refresh/reconnect/repeat preserves properties, orders, campaigns and progress.
11. Text works without a microphone; unavailable voice/app services have usable fallbacks.
12. Desktop and mobile stay usable within the measured asset/performance budget.
13. Blender projects open with assets and textures present; rigs, materials and animations remain editable.
14. The documented export workflow produces working assets, clips, colliders and matching metadata.
15. Re-running generation/export preserves hand-edited content and duplicates nothing.
16. Editing a building and re-exporting preserves merchant, NPC, enabled apps, orders and campaign bookings.
17. A new merchant gets a prepared property without launching Blender; a new template can be added via the documented export workflow.

## 18. Required delivery

Inspect the project, Blender installation and asset requirements, then state a concise plan. Prove the pipeline and build the first complete playable district. Deliver `.blend` projects, textures/dependencies, editable rigs and actions, Blender Python tools, export presets, generated runtime assets, scene manifest, visual asset catalog, runnable app source, schema and migrations, seed demo merchants, setup instructions, env-var placeholders, an acceptance walkthrough, and a practical Blender guide (change a building, add an NPC variant, create an ad surface, export, preview) separating visual changes from app configuration. Include a status table of working / live / demo / blocked, and report verification honestly.

If Blender cannot run here: supply exact scripts and instructions, complete unblocked application work, and label unexecuted outputs. Never claim a `.blend` or export was produced or validated when it was not.