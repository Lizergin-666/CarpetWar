# CarpetWar

CarpetWar is a modern Sea Battle web app with:
- Solo mode (single-board, 3-shot turns, bot difficulty levels, AI coach)
- PvP mode by invite link (Socket.IO rooms, rematch, blitz mode, timers)
- Leaderboards by player and city
- Cloud-ready stats persistence (local JSON, Supabase, or hybrid)

## Monorepo structure

- `client/` - Next.js frontend
- `server/` - Express + Socket.IO backend
- `docs/` - execution and cloud setup docs

## Local quick start

1. Server:
   - `cd server`
   - `pnpm install`
   - `cp .env.example .env`
   - `pnpm start`
2. Client:
   - `cd client`
   - `pnpm install`
   - `cp .env.example .env.local`
   - `pnpm dev`

Default URLs:
- Client: `http://localhost:3000`
- Server: `http://localhost:4000`

## Production deploy on public domain (Docker + Nginx)

Files:
- `deploy/docker-compose.prod.yml`
- `deploy/nginx.conf`
- `deploy/.env.prod.example`

Steps:
1. Copy env template:
   - `cd deploy`
   - `cp .env.prod.example .env.prod`
2. Set your domain in `.env.prod`:
   - `CLIENT_ORIGIN=https://your-domain.com`
   - `NEXT_PUBLIC_SOCKET_URL=https://your-domain.com`
3. Start stack:
   - `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
4. Check health:
   - `curl http://<server-ip>/health`

Notes:
- `nginx` routes UI to `client` and Socket.IO/API to `server`.
- For HTTPS, put Cloudflare/ELB/Caddy/Nginx SSL terminator in front, or extend `nginx.conf` with TLS certificates.

## Backend env

`server/.env`:
- `PORT=4000`
- `CLIENT_ORIGIN=http://localhost:3000`
- `STATS_PERSISTENCE_MODE=local|supabase|hybrid`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

## Supabase + Railway

- Supabase migration: `server/supabase/migrations/001_player_stats.sql`
- Full runbook: `docs/CLOUD_SETUP.md`
- Rollout plan: `docs/EXECUTION_PLAN.md`
