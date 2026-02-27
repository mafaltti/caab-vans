# Implementation Plan: MVP Vans Dashboard

**Branch**: `001-mvp-dashboard` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-mvp-dashboard/spec.md`

## Summary

Mobile-first web app for CAAB van transport status. Public dashboard shows
route list with Running/Not running status, computed next scheduled stop/time,
and a live location link. Admin panel for managing routes, schedules, and
announcements. Location ingestion from Telegram via Pabbly webhook.

Built as a single Next.js App Router application (public + admin) backed by
self-hosted Supabase (Postgres + Auth). BFF pattern via Route Handlers for
all data access. Computed fields (status, next stop) calculated server-side
in the BFF for consistency.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15 App Router)
**Primary Dependencies**: Next.js, Tailwind CSS, shadcn/ui, TanStack Query,
Zod, Luxon, `@supabase/supabase-js`
**Storage**: PostgreSQL via Supabase self-hosted Docker
**Testing**: Vitest
**Target Platform**: Mobile web (responsive, mobile-first) + desktop admin
**Project Type**: Web application (frontend + BFF)
**Performance Goals**: <2s page load on mobile 4G (FR-023)
**Constraints**: America/Bahia timezone (Luxon), no Supabase Edge Functions,
service role key server-only, WCAG 2.1 AA contrast, 44px touch targets
**Scale/Scope**: Low volume MVP — ~5 routes, ~2 admins, ~hundreds of daily
member views. 5 public screens + 8 admin screens.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Single Next.js app for both public + admin. No abstractions beyond what's needed. No multi-tenant, no i18n, no offline mode. |
| II. Explicit Trade-offs | PASS | Applied during PR authoring (not plan-time). |
| III. Branch & Merge Discipline | PASS | Working on `001-mvp-dashboard` feature branch. PR will target `dev`. |
| IV. Quality Gates | PASS | ESLint + tsc + next build + vitest configured in project setup. |
| V. Stack Constraints | PASS | Next.js App Router, Tailwind + shadcn/ui, TanStack Query, Zod, Luxon, Supabase self-host. No Edge Functions. |
| Security Constraints | PASS | Service role key in Route Handlers only. Anon key + RLS for public reads. Ingestion secured with per-van token. |
| Timezone & Data Consistency | PASS | All server-side time via Luxon `America/Bahia`. BFF computes status/next stop. |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── public-api.md
│   ├── admin-api.md
│   └── ingestion-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (public)/                 # Public route group (no URL prefix)
│   │   ├── layout.tsx            # Public layout (nav with announcements tab)
│   │   ├── page.tsx              # Home — route list
│   │   ├── routes/
│   │   │   └── [routeId]/
│   │   │       └── page.tsx      # Route detail
│   │   └── announcements/
│   │       └── page.tsx          # Announcements list
│   ├── admin/
│   │   ├── layout.tsx            # Admin layout (sidebar, auth guard)
│   │   ├── page.tsx              # Admin dashboard / redirect
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── routes/
│   │   │   ├── page.tsx          # Route list
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [routeId]/
│   │   │       └── page.tsx      # Edit route + schedule editor
│   │   ├── announcements/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [announcementId]/
│   │   │       └── page.tsx
│   │   └── users/                # Superuser only
│   │       ├── page.tsx
│   │       └── new/
│   │           └── page.tsx
│   └── api/                      # BFF Route Handlers
│       ├── routes/
│       │   └── route.ts          # GET /api/routes
│       ├── routes/[routeId]/
│       │   └── route.ts          # GET /api/routes/:routeId
│       ├── announcements/
│       │   └── route.ts          # GET /api/announcements
│       ├── admin/
│       │   ├── routes/
│       │   │   └── route.ts      # POST
│       │   ├── routes/[routeId]/
│       │   │   └── route.ts      # PUT, DELETE
│       │   ├── routes/[routeId]/schedule/
│       │   │   └── route.ts      # GET, POST
│       │   ├── routes/[routeId]/schedule/[entryId]/
│       │   │   └── route.ts      # PUT, DELETE
│       │   ├── announcements/
│       │   │   └── route.ts      # POST
│       │   ├── announcements/[announcementId]/
│       │   │   └── route.ts      # PUT, DELETE
│       │   └── users/
│       │       └── route.ts      # GET, POST
│       │   └── users/[userId]/
│       │       └── route.ts      # PUT
│       └── ingest/
│           └── [vanId]/
│               └── route.ts      # POST (Pabbly webhook)
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── public/                   # Public app components
│   │   ├── route-card.tsx
│   │   ├── route-status-badge.tsx
│   │   ├── schedule-list.tsx
│   │   ├── next-stop-display.tsx
│   │   ├── location-link-cta.tsx
│   │   ├── announcement-card.tsx
│   │   └── bottom-nav.tsx
│   └── admin/                    # Admin components
│       ├── sidebar-nav.tsx
│       ├── route-form.tsx
│       ├── schedule-editor.tsx
│       ├── announcement-form.tsx
│       └── user-form.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client (anon key)
│   │   └── server.ts             # Server client (service role key)
│   ├── time.ts                   # Luxon helpers (America/Bahia)
│   ├── validators/               # Zod schemas
│   │   ├── route.ts
│   │   ├── schedule-entry.ts
│   │   ├── announcement.ts
│   │   ├── user.ts
│   │   └── ingestion.ts
│   └── queries/                  # TanStack Query hooks
│       ├── use-routes.ts
│       ├── use-route-detail.ts
│       └── use-announcements.ts
└── types/
    └── index.ts                  # Shared TypeScript types

infra/
├── supabase/                     # Supabase Docker self-host
└── caab-vans/                    # App Docker Compose + Caddy

public/                           # Static assets
```

**Structure Decision**: Single Next.js app at repo root. Public and admin
share the same deployment. App Router route groups `(public)` and `admin/`
separate concerns without additional projects. `infra/` sits alongside for
deployment configs. This is the simplest structure per KISS — no monorepo
tooling needed for MVP.

## Complexity Tracking

> No constitution violations. Table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                    |
