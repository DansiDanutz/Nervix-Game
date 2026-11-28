# Nervix World

**A persistent 3D city where players meet real merchants, talk to their AI employees, and buy through NervixPay.**

Nervix World is a Blender-first 3D adventure game and merchant platform. The city is the interface: you walk in as a customizable character, enter a merchant's property, talk to that merchant's AI employee, use a connected app, and complete a confirmed purchase.

- **Visual source of truth:** Blender (`.blend` projects are mandatory deliverables)
- **Runtime:** browser game, React + TypeScript + Three.js + React Three Fiber
- **Backend:** identity, merchant provisioning, agent tools, orders, payments, campaigns
- **Payments:** NervixPay (server-side adapter, demo adapter until live credentials exist)

## Licence

**AGPL-3.0-only** for all code (`LICENSE`). Assets are licensed separately — see [docs/ASSETS.md](docs/ASSETS.md).

## Status

Scaffold only. No Blender scene, no runtime export, and no game build has been produced or validated yet. [PROGRESS.md](PROGRESS.md) carries the live status and next step.

## Layout

| Path | Contents |
|---|---|
| `blender/scenes/` | Editable district assembly files (`nervix_city_district_01.blend`) |
| `blender/assets/buildings/` | Merchant house, café, casino venue, interiors, modular architecture |
| `blender/assets/characters/` | Player base, merchant NPC variants, rigs, clothing, actions |
| `blender/assets/props/` | Fountain, trees, signs, banners, interaction objects |
| `blender/materials/` | Shared editable materials |
| `blender/textures/` | Editable texture sources and export textures |
| `blender/scripts/` | `bpy` tooling: validate, export, manifest |
| `exports/` | Generated runtime assets and the versioned scene manifest |
| `docs/` | Master prompt, asset policy, environment record |
| `tools/` | Repo-level helper scripts |

## Requirements

- Blender 4.x (not installed on this machine yet — see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md))
- Node.js 20+ and pnpm for the runtime
- A relational database (Postgres) and a realtime transport for presence

## Getting started

```sh
git clone <this repo> && cd nervix-world
# Blender: install 4.x, then run the Milestone 0 validation
blender --background --python blender/scripts/validate_scene.py
```

The full specification is in [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md).
## Build the merchant city

[Game brief](game.md) · [Roadmap](Roadmap.md) · [Architecture](ARCHITECTURE.md) · [Original image gallery](assets/references/README.md) · [Contributing from any harness](CONTRIBUTING.md)
