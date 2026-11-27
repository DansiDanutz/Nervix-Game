# Setup

## Prerequisites

- Node.js 20+ (verified: v26.13.0) and pnpm 10 (verified: 10.32.1)
- Blender 4.x — **not installed on this machine yet**
- PostgreSQL 14+ with `pgcrypto`

## App

```sh
cd app
pnpm install --store-dir "$PWD/../.pnpm-store"   # a workspace-local store avoids touching the global one
pnpm dev        # http://localhost:5173
pnpm build      # tsc --noEmit && vite build  (verified green)
```

The app boots into an explicit **blockout** (ground, fountain, two placeholder blocks) until `public/manifest.json` and the exported GLBs exist. That blockout is temporary and has a replacement path: Milestone 1's Blender district.

The client talks to the demo API at `http://localhost:8787` (override with `VITE_API_URL`). Start the API first; the HUD shows "demo API connected" or "API offline — blockout only". The side panel holds the account card (email → 6-digit code → verified) and the merchant's AI employee: ask a question, and a confirming action (checkout, support) requires an explicit **Confirm**.

Checkout: the Orders panel lists the player's orders and offers **Pay (demo)** then **Fulfil**; outcomes are simulated and a redirect is never treated as proof of payment.

The Lost Seals quest: progress is sequential and persisted per user; walk up to a seal marker and press **E** to collect it. Three seals complete the quest — no purchase required.

Multiplayer presence uses `ws://localhost:8787/presence` (override with `VITE_WS_URL`). Other players in the district appear as capsules; the status pill shows `presence live (n)`. Presence carries public position only — merchant conversations are never broadcast.

## Server

```sh
cd server
node --test test/     # 31 tests, verified green
node seed/demo-merchants.mjs | psql "$DATABASE_URL" -v ON_ERROR_STOP=1

# runnable demo API (in-memory, zero dependencies)
PORT=8787 node src/index.mjs
curl -s localhost:8787/health
```

Demo endpoints: `POST /session`, `POST /auth/signup`, `POST /auth/login`, `POST /auth/verify`,
`POST /merchants/provision`, `GET /catalog`,
`POST /orders`, `POST /orders/:id/events`, `POST /orders/:id/fulfil`,
`POST /agent/:propertyId/message`, `POST /agent/:propertyId/confirm`,
`POST /campaigns`, `POST /campaigns/:id/{request-payment,pay,tick,pause,resume,cancel}`,
`GET /placements/:id/servable`, `GET /quests/lost-seals`, `GET /progress?userId=…`, `POST /progress`,
`GET /orders?buyerId=…`, `GET/POST /merchants/:id/products`, `PATCH /merchants/:id/agent`, `PATCH /merchants/:id/appearance`.

## Database

Verified on PostgreSQL 16.15 (Homebrew) at `/tmp:5432`, database `nervix_world`.

```sh
createdb -h /tmp nervix_world
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/001_init.sql
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/002_text_ids.sql
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/003_users_text.sql
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/004_merchants_text.sql
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/005_conversations.sql
psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1 -f server/db/migrations/006_campaigns_text.sql
node server/seed/demo-merchants.mjs | psql -h /tmp -d nervix_world -v ON_ERROR_STOP=1
```

Migrations 002–004 convert `orders.id`, `properties.id`, `users.id` and `merchants.id` to `text`
so the application's stable ids (`ord_1`, `prop_<hash>`, `mer_1`) persist verbatim.

## Persistence

Set `DATABASE_URL` to switch the API from the in-memory store to Postgres:

```sh
DATABASE_URL="postgresql:///nervix_world?host=/tmp" PORT=8787 node server/src/index.mjs
```

Verified: order created → `payment_created` → `payment_succeeded` lands as `paid` in the
`orders` table, and `GET /orders/:id` returns it with items **after a process restart**.

## Environment variables

Copy `.env.example` to `.env` and fill in. **No key is committed.** The NervixPay values stay empty until the live integration inputs exist (see `server/src/nervixpay.demo.mjs`).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `NERVIXPAY_MODE` | `demo` (default) or `live` |
| `NERVIXPAY_BASE_URL` | live only |
| `NERVIXPAY_MERCHANT_ID` | live only |
| `NERVIXPAY_SIGNING_KEY` | live only, server-side |
| `NERVIXPAY_WEBHOOK_SECRET` | live only, server-side |
| `AGENT_MODEL_BASE_URL`, `AGENT_MODEL_KEY` | merchant AI employee provider |
| `SPEECH_BASE_URL`, `SPEECH_KEY` | optional voice |

## Identity

`POST /auth/signup` creates an unverified user and a single-use 6-digit code (hashed at rest,
10-minute expiry). `POST /auth/login` issues a new code. `POST /auth/verify` consumes it and
marks the user verified.

**The API returns `devCode` because this is the demo.** In production the code is emailed and
never returned; matching an email alone never grants access to an existing account.

## What is demo

- Session/identity (local demo session, no real email verification)
- NervixPay adapter (simulated outcomes)
- Merchant data (seed only)

A browser redirect or an agent statement is never treated as proof of payment.