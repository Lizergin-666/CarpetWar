# Cloud Setup (Supabase + Railway)

This document describes how to run CarpetWar locally first, then switch to cloud persistence and deploy.

## 1) Local First (no cloud required)

1. Start server from `server/` with default `.env` values.
2. Start client from `client/`.
3. Keep `STATS_PERSISTENCE_MODE=local` to store PvP stats in `server/data/pvp-stats.json`.

This is the safest mode for demos when cloud keys are not ready.

## 2) Supabase persistence (manual action required)

When ready, keep using the same backend code and only switch env.

1. Open your Supabase project.
2. Run SQL from:
   - `server/supabase/migrations/001_player_stats.sql`
3. In backend env (`server/.env`), set:
   - `STATS_PERSISTENCE_MODE=supabase` (or `hybrid`)
   - `SUPABASE_URL=<project-url>`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
4. Restart backend.

Notes:
- `supabase` mode writes only to Supabase.
- `hybrid` mode writes to Supabase and local JSON.
- If Supabase keys are missing, server automatically falls back to local persistence.

## 3) Railway deployment (manual action required)

Recommended split:
- Service A: `server/` (Socket.IO + API)
- Service B: `client/` (Next.js UI)

### Service A (`server`)
- Root directory: `server`
- Install: `pnpm install --frozen-lockfile`
- Start: `pnpm start`
- Required env:
  - `PORT` (Railway injects this automatically)
  - `CLIENT_ORIGIN=<public-url-of-client-service>`
  - `STATS_PERSISTENCE_MODE=local|supabase|hybrid`
  - `SUPABASE_URL` (if using Supabase)
  - `SUPABASE_SERVICE_ROLE_KEY` (if using Supabase)

### Service B (`client`)
- Root directory: `client`
- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Start: `pnpm start`
- Required env:
  - `NEXT_PUBLIC_SOCKET_URL=<public-url-of-server-service>`

## 4) Smoke tests after deploy

1. Open app and run solo match.
2. Open PvP in two tabs, create room, join by code.
3. Fire 3 shots and confirm turn switch.
4. Finish match and verify leaderboard updates.
5. Restart server and verify stats survive restart (Supabase or local JSON, depending on mode).

