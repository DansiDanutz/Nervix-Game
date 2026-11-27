# Acceptance walkthrough

Each criterion from `MASTER_PROMPT.md` §17, with the evidence that exists today and an
honest status. "Met (demo)" means the flow works end to end against the demo adapters;
"Blocked" names the external dependency.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Sign in, create avatar, explore, return with saved progress | Met (demo) | `AuthPanel` email→code→verified; avatar customization is still minimal; quest progress persists in Postgres |
| 2 | Merchant gets exactly one property and agent; retry creates no duplicate | Met | `provision.mjs` tests; API retry returns `created:false` |
| 3 | Two sessions see each other without sharing merchant conversations | Met | `presence.mjs` tests + live 2-client run; presence carries public position only |
| 4 | Intro adventure completable without a purchase | Met | `quests.mjs` tests; 3 seals, no payment path |
| 5 | Agent answers from its own merchant information, flags gaps, respects permissions | Met (demo) | approved-knowledge grounding, catalog fallback, tool authorization, `cap_reached`; live cheesecake answer |
| 6 | Enabled app opens in correct context; unauthorized connection rejected | Met (demo) | app catalog connect/disconnect, tenant isolation verified |
| 7 | Purchase reaches verified payment, receipt/entitlement; duplicates cause no double fulfilment | Met (demo) | ledger tests; live pay→fulfil; duplicate event returns same order |
| 8 | Pending/failed/cancelled/expired/late payments accurate | Met (demo) | ledger transition tests incl. expiry and refunds |
| 9 | Ad previewed, bought, scheduled, displayed, expired; unpaid never serves | Met (demo) | campaign tests; live unpaid `servable False`, paid+activated `True` |
| 10 | Refresh/reconnect/repeat preserves state | Met | orders, campaigns, conversations, quest progress all read back after restart |
| 11 | Text works without microphone; voice/app fallbacks usable | Met (demo) | text always available; `/speak` returns `available:false` without a provider; client falls back to browser speech |
| 12 | Desktop/mobile usable within measured budget | Partial | shell 17.15 kB; FPS meter live; 60/30 profiles **not yet measured** on the district |
| 13 | Blender projects open with assets/textures; rigs/materials/animations editable | Met | `nervix_city_district_01.blend` + `m0_street_corner.blend`; validate 12/12 and 7/7 |
| 14 | Export workflow produces working assets, clips, colliders, metadata | Met | 9 GLBs + manifest (12 markers); GLB header verified; runtime loads them |
| 15 | Re-running generation/export preserves hand-edited content, no duplicates | Met | rebuild → 6 objects / 5 meshes / 2 actions, identical GLB size (M0); district rebuild is from empty and only touches `NERVIX_MANAGED` |
| 16 | Editing a building and re-exporting preserves merchant, NPC, apps, orders, campaigns | Partial | stable slot ids and backend ownership exist; not yet demonstrated end to end |
| 17 | New merchant gets a prepared property without Blender; new template via documented export | Met | provisioning uses slot data; `BLENDER_GUIDE.md` documents the template workflow |

## Blocked by external dependencies

- **Live NervixPay** — endpoints, merchant id, signing key, webhook verification.
- **Real email delivery** — codes are returned as `devCode` in demo.
- **Visual review** — the four concept images were not visually inspected in this session.
- **Performance profiles** — 60 FPS desktop / 30 FPS mobile need a measured run on the district.

## How to reproduce

```sh
# backend + database
createdb -h /tmp nervix_world
for f in server/db/migrations/00*.sql server/db/migrations/01*.sql; do psql -h /tmp -d nervix_world -f "$f"; done
node server/seed/demo-merchants.mjs | psql -h /tmp -d nervix_world
DATABASE_URL="postgresql:///nervix_world?host=/tmp" PORT=8787 node server/src/index.mjs

# client
cd app && pnpm install && pnpm dev
```

Then: Enter the city → sign in → talk to Mira → ask about a product → order → Pay (demo) → Fulfil → Refund.