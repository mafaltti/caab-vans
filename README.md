# CAAB Vans

Mobile web app to see running CAAB van routes, next scheduled stop/time, announcements, and a live location link.

Built for CAAB members (lawyers and trainees) to quickly decide where and when to catch a van by checking route status, schedules, and real-time position -- all in under a minute.

## Features

- **Public portal** -- mobile-first dashboard showing route status (Running / Not running), next scheduled stop with countdown, and live location link
- **Admin panel** -- role-based CRUD for routes, schedules, stops, and announcements (admin + superuser roles)
- **GPS tracker** -- standalone Android app that sends van GPS coordinates via background foreground service
- **Announcements** -- pinned/urgent notices with automatic expiry
- **Live tracking** -- real-time van position with ETA based on GPS distance or schedule fallback

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend + BFF | Next.js 16 (App Router), TypeScript, React 19 |
| Styling | Tailwind CSS 4, shadcn/ui, Motion |
| Data fetching | TanStack Query (polling, caching, dedupe) |
| Backend | Supabase self-hosted (Postgres, Auth, Realtime, Storage) |
| Van tracker | Expo + TypeScript (Android), expo-location, expo-task-manager |
| Validation | Zod |
| Time | Luxon (forced `America/Bahia` timezone) |
| Reverse proxy | Caddy (TLS termination + routing) |

## Architecture

The system has three main components:

1. **Next.js web app** -- serves the public portal and admin panel, plus a BFF layer (`/api/*`) that talks to Supabase with the service role key
2. **Supabase self-hosted** -- Postgres database, Auth, Realtime, and Storage running as a Docker Compose stack
3. **Van tracker app** -- standalone Expo/Android app installed on van phones that sends GPS pings to the ingest API

Data flow: Web UI -> Next.js BFF (`/api/*`) -> Supabase (Postgres). The van tracker posts GPS pings directly to the ingest endpoint.

## Project Structure

```
caab-vans/
  apps/
    van-tracker/        # Expo Android GPS tracker app
  docs/                 # Project documentation (PRD, tech, principles)
  infra/
    supabase/           # Supabase self-host Docker Compose stack
    caab-vans/          # Next.js app Docker Compose + Caddy config
  scripts/              # DB migration, seed, and utility scripts
  specs/                # Feature specifications (Spec Kit)
  src/
    app/
      (public)/         # Public portal pages
      admin/            # Admin panel pages
      api/              # BFF route handlers
      driver/           # Driver-facing pages
    components/         # Shared React components
    lib/                # Utilities, API helpers, Supabase clients
    types/              # TypeScript type definitions
  supabase/
    migrations/         # SQL migration files
```

## Prerequisites

- Node.js 22+
- npm
- Docker and Docker Compose (for Supabase)
- Git

## Getting Started (Local Development)

1. **Start Supabase**

   ```bash
   cd infra/supabase
   cp .env.example .env    # adjust secrets as needed
   docker compose up -d
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to match your local Supabase instance.

4. **Run migrations**

   ```bash
   npm run db:migrate
   ```

5. **Seed data**

   ```bash
   npm run db:seed
   ```

6. **Pre-compute stop distances** *(optional, requires OSRM)*

   Computes road-network distances between consecutive stops for more accurate ETA congestion factors. Falls back to straight-line estimation if skipped. **Re-run after adding, removing, or relocating stops** — the script resets stale values automatically.

   ```bash
   OSRM_BASE_URL=http://localhost:5000 DATABASE_URL=postgresql://... npx tsx scripts/precompute-stop-distances.ts
   ```

7. **Calibrate time-of-day factors** *(optional, requires historical data)*

   Generates data-driven congestion factors from past route runs. Falls back to built-in defaults if skipped. Re-run periodically (monthly recommended) as data accumulates.

   ```bash
   DATABASE_URL=postgresql://... OSRM_BASE_URL=http://localhost:5000 npx tsx scripts/compute-time-factors.ts
   ```

8. **Start dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Production Deployment

The production setup runs two Docker Compose stacks on a single VPS behind Caddy:

- `infra/supabase/` -- Supabase self-host stack
- `infra/caab-vans/` -- Next.js app

Caddy handles TLS termination and routes traffic to the appropriate service. See [docs/TECH.md](docs/TECH.md) for domain configuration, security model, and operational notes.

## Van Tracker App

The van tracker is a standalone Expo + TypeScript Android app at `apps/van-tracker/`. It uses `expo-location` and `expo-task-manager` to send GPS coordinates as a background foreground service. Built and deployed via EAS.

See [apps/van-tracker/README.md](apps/van-tracker/README.md) for setup, build profiles, and troubleshooting.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/PRD-MVP.md](docs/PRD-MVP.md) | Product requirements and decision rules |
| [docs/TECH.md](docs/TECH.md) | Tech stack, infra, security model, deployment |
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | Engineering principles (KISS, DRY, YAGNI) |
| [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md) | Branch strategy and PR rules |
| [docs/DELIVERY-WORKFLOW.md](docs/DELIVERY-WORKFLOW.md) | Deployment pipeline and quality gates |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run tests (Vitest) |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with sample data |
| `npx tsx scripts/precompute-stop-distances.ts` | Pre-compute OSRM road distances between stops (requires `DATABASE_URL`, `OSRM_BASE_URL`) |
| `npx tsx scripts/compute-time-factors.ts` | Generate time-of-day congestion factors from historical data (requires `DATABASE_URL`, `OSRM_BASE_URL`) |

## License

Private / internal use only.
