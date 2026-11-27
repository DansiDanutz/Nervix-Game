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

## Server

```sh
cd server
node --test test/     # 14 tests, verified green
node seed/demo-merchants.mjs | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

## Database

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/db/migrations/001_init.sql
```

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

## What is demo

- Session/identity (local demo session, no real email verification)
- NervixPay adapter (simulated outcomes)
- Merchant data (seed only)

A browser redirect or an agent statement is never treated as proof of payment.