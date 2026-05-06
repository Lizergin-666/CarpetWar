# CarpetWar Execution Plan

## Goal
Build a startup-grade Sea War web platform with:
- Solo mode with AI difficulties and match analytics
- PvP by invite link with realtime sync
- City leaderboard and retention mechanics
- Monetization-ready surface (`Upgrade to Pro`)
- Cloud-ready backend for Supabase + Railway

## Current Status (Done)
- Single-board solo mode (3-shot salvos), AI bot levels, local history, AI Coach
- PvP rooms with Socket.IO, mode switching (`classic`, `blitz3m`)
- Turn timers, blitz match timer, timeout auto-fire, draw handling
- Rematch handshake in-room
- Live leaderboard and player profiles (name + city)
- Invite links (`/pvp?room=CODE`) and one-click copy
- Leaderboard persistence to local JSON (`server/data/pvp-stats.json`)

## Phase Plan

### Phase 1: Product Hardening (No Cloud Needed)
1. Stabilize data layer behind an interface with pluggable providers.
2. Keep local provider as default (JSON) for zero-friction demo.
3. Add validation and structured error paths for profile/stat updates.
4. Finalize README and quick-start scripts.

**Definition of Done**
- Server runs locally with no cloud keys.
- Lint/typecheck/build pass.
- Existing gameplay flows unchanged.

### Phase 2: Supabase Readiness (Code + Artifacts, No Account Actions)
1. Add Supabase provider for stats/leaderboard storage via ENV.
2. Add SQL schema/migration files for required tables and indexes.
3. Add `.env.example` blocks and migration runbook.
4. Keep automatic fallback to local provider if Supabase ENV absent.

**Definition of Done**
- Code path exists and compiles with/without Supabase ENV.
- Clear one-page checklist for manual Supabase setup.

### Phase 3: Railway Readiness (Config + Runbook, No Deploy Action)
1. Add deployment runbook with service split (`client`, `server`).
2. Add healthcheck, start commands, required env vars.
3. Document minimal/free-plan-safe topology.

**Definition of Done**
- Repo contains deployment checklist and env mapping.
- Only manual platform clicks remain.

### Phase 4: Growth Features
1. Polish onboarding UX for new users entering PvP.
2. Add feature-gating surface for Pro roadmap.
3. Add release notes and changelog discipline.

## Risks & Mitigation
- **Cloud credentials unavailable**: keep local fallback provider.
- **Untracked binary churn in `image/` and `sound/`**: keep excluded from commits.
- **Realtime race conditions**: preserve server-authoritative state transitions.

## Intervention Points (User Required)
Only two moments require user intervention:
1. **Supabase**: create/choose project, run SQL migration, provide URL + service key.
2. **Railway**: create services, set env vars, bind start commands, deploy.
