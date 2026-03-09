# CAAB Vans - Tech Stack and Infrastructure Reference

## Product Shape

The system has three runtime pieces:

1. Next.js web app with public pages, admin pages, and `/api/*` route handlers.
2. Self-hosted Supabase for Postgres, Auth, Studio, and related services.
3. Expo-based Android tracker app that posts GPS pings to the Next.js API.

## Supported Deployment Model

The supported production topology is:

- `infra/supabase/` via Docker Compose
- Next.js app on the VPS via `systemd`
- Caddy as the public entrypoint and TLS terminator
- Optional `infra/osrm/` for road snapping and routing

This repo does not currently support an app Docker Compose stack as the canonical path.

## Stack

### Web App

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- TanStack Query
- MapLibre GL
- motion
- Zod
- Luxon

### Backend and Data

- Supabase self-hosted
- Postgres
- GoTrue Auth
- PostgREST
- Kong gateway
- Supabase Studio

### Tracker App

- Expo SDK 55
- React Native
- expo-location
- expo-task-manager
- expo-secure-store
- expo-battery
- @sentry/react-native
- EAS Build

### Tooling

- ESLint
- Prettier
- Vitest

## Architecture Constraints

- Supabase Edge Functions are out of scope.
- The service-role key is server-only.
- The anon key is intentionally public.
- Tracker devices authenticate with per-van `x-ingestion-token`, not Supabase Auth.
- Business logic for route status, progress, and ETA belongs in the BFF/server layer.
- Canonical timezone is `America/Bahia`.
- `data/time-factors.json` is generated runtime data, not committed configuration.

## Network and Exposure Rules

Publicly exposed services:

- Caddy on `80/443`
- Supabase gateway if client/browser access is needed
- Studio only behind Basic auth

Never expose publicly:

- Postgres
- internal service ports beyond the proxy boundary

## Suggested Hostnames

Use placeholders in deploy docs, then substitute real client values:

- `APP_DOMAIN` for the public app
- `API_DOMAIN` for the Supabase gateway
- `STUDIO_DOMAIN` for Studio

Example:

```text
APP_DOMAIN=vans.example.com
API_DOMAIN=api-vans.example.com
STUDIO_DOMAIN=studio-vans.example.com
```

## Operational Expectations

- Backups and monitoring are still operator responsibilities; they are not automated in this repo.
- OSRM is optional. If omitted, ETA falls back to haversine-based estimation.
- The app-level rate limiter is in-memory and process-local.
- Tracker background behavior depends on Android battery-optimization whitelisting.
- Tests are primarily unit tests; there is no e2e suite in the repo today.

For deployer steps, use [DEPLOYMENT.md](DEPLOYMENT.md). For ongoing reference, use [OPERATIONS.md](OPERATIONS.md).
