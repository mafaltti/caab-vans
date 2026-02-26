# Quickstart: MVP Vans Dashboard

**Branch**: `001-mvp-dashboard` | **Date**: 2026-02-26

## Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose (for Supabase self-host)
- Git

## 1. Clone and Install

```bash
git clone <repo-url> caab-vans
cd caab-vans
npm install
```

## 2. Start Supabase (Local Development)

```bash
cd infra/supabase
cp .env.example .env    # Edit with local credentials
docker compose up -d
```

Wait for all containers to be healthy. Studio will be available at
`http://localhost:54323`.

## 3. Configure Environment

Create `.env.local` at the repo root:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Get the keys from `infra/supabase/.env` or Supabase Studio settings.

## 4. Run Database Migrations

```bash
npm run db:migrate
```

This creates the tables: `routes`, `vans`, `schedule_entries`,
`announcements`, and applies RLS policies.

## 5. Seed Initial Superuser

```bash
npm run db:seed
```

This creates the initial superuser account. Check `scripts/seed.ts` for
the default credentials (change them after first login).

## 6. Start Development Server

```bash
npm run dev
```

- Public app: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`
- API: `http://localhost:3000/api/*`

## 7. Run Quality Checks

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run build         # next build
npm run test          # vitest
```

All four must pass before opening a PR (Constitution §IV).

## Key Development Notes

- **Timezone**: All time operations use Luxon with `America/Bahia`. Use the
  helpers in `src/lib/time.ts`.
- **Validation**: All API inputs validated with Zod schemas in
  `src/lib/validators/`.
- **Supabase client**: Use `src/lib/supabase/server.ts` (service role) in
  Route Handlers. Use `src/lib/supabase/client.ts` (anon key) only if needed
  for browser-side Supabase Auth.
- **Computed fields**: Status, next stop, and isOutdated are computed in
  Route Handlers, never stored in the database.
- **UI components**: Use shadcn/ui primitives from `src/components/ui/`.
  Custom components in `src/components/public/` and `src/components/admin/`.
- **Language**: All user-facing text in Portuguese (pt-BR). Code, comments,
  and commits in English.
