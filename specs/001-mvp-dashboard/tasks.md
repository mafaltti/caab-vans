# Tasks: MVP Vans Dashboard

**Input**: Design documents from `specs/001-mvp-dashboard/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md
**Tests**: Not requested — each task includes a verification step instead.
**Organization**: Tasks grouped by user story. US1+US2 merged (both P1, tightly coupled).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on pending tasks)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Scaffold the Next.js project, install all dependencies, configure tooling.

- [ ] T001 Initialize Next.js 15 App Router project with TypeScript and Tailwind CSS
  - **Goal**: Scaffold a Next.js project at repo root with App Router, TypeScript, Tailwind, ESLint, and `src/` directory
  - **Files**: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`
  - **Run**: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*"` (handle non-empty directory prompt)
  - **Verify**: `npm run build` passes

- [ ] T002 Install project dependencies
  - **Goal**: Add all runtime and dev dependencies from plan.md tech context
  - **Files**: `package.json`
  - **Run**: `npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query luxon zod` then `npm install -D @types/luxon vitest @vitejs/plugin-react tsx`
  - **Verify**: `npm ls --depth=0` shows all packages installed

- [ ] T003 Initialize shadcn/ui
  - **Goal**: Set up shadcn/ui with Zinc base color, Blue accent, and Lucide icons
  - **Files**: `components.json`, `src/lib/utils.ts`, `tailwind.config.ts` (updated), `src/app/globals.css` (updated)
  - **Run**: `npx shadcn@latest init` (select: New York style, Zinc, CSS variables yes)
  - **Verify**: `npm run build` passes

- [ ] T004 Install required shadcn/ui components
  - **Goal**: Add all UI primitives needed across public and admin screens
  - **Files**: `src/components/ui/*.tsx` (one file per component)
  - **Run**: `npx shadcn@latest add button card badge input label textarea skeleton alert dialog select switch separator table dropdown-menu tabs navigation-menu`
  - **Verify**: `npm run build` passes

- [ ] T005 Configure Vitest
  - **Goal**: Set up Vitest with React support and path aliases matching tsconfig
  - **Files**: `vitest.config.ts`, `package.json` (add `"test": "vitest"` script)
  - **Run**: add script to package.json, create vitest.config.ts with `@vitejs/plugin-react` and `resolve.alias` for `@/*`
  - **Verify**: `npm run test -- --run` exits cleanly (no tests yet)

- [ ] T006 Configure Prettier
  - **Goal**: Set up Prettier with consistent formatting rules
  - **Files**: `.prettierrc`, `.prettierignore`
  - **Run**: `npm install -D prettier` then create config files
  - **Verify**: `npx prettier --check "src/**/*.{ts,tsx}"` passes

- [ ] T007 Create project directory structure
  - **Goal**: Create all directories from plan.md source code structure (empty dirs with `.gitkeep`)
  - **Files**: `src/components/public/`, `src/components/admin/`, `src/lib/supabase/`, `src/lib/validators/`, `src/lib/queries/`, `src/lib/api/`, `src/types/`, `infra/supabase/`, `infra/caab-vans/`, `scripts/`, `supabase/migrations/`
  - **Run**: `mkdir -p` for each directory, add `.gitkeep` files
  - **Verify**: `ls -R src/` shows expected structure

- [ ] T008 Create environment file templates
  - **Goal**: Provide `.env.local.example` with all required env vars documented
  - **Files**: `.env.local.example`, `.gitignore` (ensure `.env*` excluded except example)
  - **Run**: create file with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
  - **Verify**: manual — confirm `.env.local.example` has all vars, `.gitignore` excludes `.env.local`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can start.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 [P] Define shared TypeScript types in `src/types/index.ts`
  - **Goal**: Create types matching data-model.md entities and API response shapes from contracts/
  - **Files**: `src/types/index.ts`
  - **Run**: define types: `Route`, `Van`, `ScheduleEntry`, `Announcement`, `AdminUser`, `RouteWithStatus` (computed fields), `ApiError`, `ScheduleStatus`
  - **Verify**: `npm run typecheck` passes (`tsc --noEmit` — add script to package.json if missing)

- [x] T010 [P] Create Supabase server client in `src/lib/supabase/server.ts`
  - **Goal**: Export `createServiceClient()` using service role key (bypasses RLS) and `createSessionClient(cookieStore)` using anon key + cookies for auth session reads
  - **Files**: `src/lib/supabase/server.ts`
  - **Run**: use `@supabase/ssr` `createServerClient` for session client, plain `@supabase/supabase-js` `createClient` for service client. Read keys from `process.env`.
  - **Verify**: `npm run typecheck` passes

- [x] T011 [P] Create Supabase browser client in `src/lib/supabase/client.ts`
  - **Goal**: Export `createBrowserClient()` using anon key for browser-side auth (login form)
  - **Files**: `src/lib/supabase/client.ts`
  - **Run**: use `@supabase/ssr` `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **Verify**: `npm run typecheck` passes

- [x] T012 [P] Create Luxon time helpers in `src/lib/time.ts`
  - **Goal**: Centralize all timezone logic. Export helpers: `nowBahia()`, `isSameDay(dt)`, `formatTime(dt)`, `parseTime(hhMm)`, `isWithinScheduleWindow(entries, now)`, `getNextStop(entries, now)`
  - **Files**: `src/lib/time.ts`
  - **Run**: all functions use `DateTime.now().setZone('America/Bahia')` as canonical time source
  - **Verify**: `npm run typecheck` passes

- [x] T013 [P] Create Zod validators for route and schedule-entry in `src/lib/validators/`
  - **Goal**: Validation schemas matching data-model.md rules: route name (non-empty, max 100), vanId (uuid), stop name (non-empty, max 200), time (HH:mm format)
  - **Files**: `src/lib/validators/route.ts`, `src/lib/validators/schedule-entry.ts`
  - **Run**: export `createRouteSchema`, `updateRouteSchema`, `createScheduleEntrySchema`, `updateScheduleEntrySchema`
  - **Verify**: `npm run typecheck` passes

- [x] T014 [P] Create Zod validators for announcement, user, and ingestion in `src/lib/validators/`
  - **Goal**: Validation schemas: announcement (title max 200, body max 2000, optional future expiresAt), user (valid email, password min 8, role enum), ingestion (message string)
  - **Files**: `src/lib/validators/announcement.ts`, `src/lib/validators/user.ts`, `src/lib/validators/ingestion.ts`
  - **Run**: export `createAnnouncementSchema`, `updateAnnouncementSchema`, `createUserSchema`, `updateUserSchema`, `ingestionSchema`
  - **Verify**: `npm run typecheck` passes

- [x] T015 Create Supabase Docker Compose config in `infra/supabase/`
  - **Goal**: Set up self-hosted Supabase for local development with Postgres, Auth, Studio, and REST API
  - **Files**: `infra/supabase/docker-compose.yml`, `infra/supabase/.env.example`
  - **Run**: base on official Supabase self-host Docker config. Enable: Postgres, Auth (GoTrue), REST (PostgREST), Studio. Disable: Edge Functions. Expose Studio on port 54323, API on 54321.
  - **Verify**: manual — `docker compose config` in `infra/supabase/` validates without errors

- [x] T016 Create database migration SQL in `supabase/migrations/00001_initial_schema.sql`
  - **Goal**: Full initial schema from data-model.md: tables (routes, vans, schedule_entries, announcements), constraints, indexes, RLS policies, updated_at trigger
  - **Files**: `supabase/migrations/00001_initial_schema.sql`
  - **Run**: write SQL for: `vans` table (with `ingestion_token` unique), `routes` table (with `van_id` unique FK), `schedule_entries` (with `(route_id, time)` unique, cascade delete), `announcements` (with `(is_pinned DESC, created_at DESC)` index), `updated_at` trigger function, RLS policies per data-model.md
  - **Verify**: manual — review SQL syntax; will be tested when migration runs against Supabase

- [x] T017 Create migration runner script in `scripts/migrate.ts`
  - **Goal**: Node script that reads SQL files from `supabase/migrations/` and executes them against the local Supabase Postgres
  - **Files**: `scripts/migrate.ts`, `package.json` (add `"db:migrate": "tsx scripts/migrate.ts"`)
  - **Run**: use `DATABASE_URL` env var to connect. Read `.sql` files sorted by name, execute sequentially. Track applied migrations in a `_migrations` table.
  - **Verify**: `npm run db:migrate` — runs without error when Supabase is up (or exits with clear connection error message)

- [x] T018 Create seed script in `scripts/seed.ts`
  - **Goal**: Seed the initial superuser via Supabase Auth admin API, creating user with `app_metadata: { role: "superuser", is_active: true }`
  - **Files**: `scripts/seed.ts`, `package.json` (add `"db:seed": "tsx scripts/seed.ts"`)
  - **Run**: use `@supabase/supabase-js` service role client. Call `auth.admin.createUser()` with a default email/password. Log credentials to console.
  - **Verify**: `npm run db:seed` — runs without error when Supabase is up

- [x] T019 [P] Create API error response helper in `src/lib/api/errors.ts`
  - **Goal**: Standardized error responses matching the common error shape from admin-api.md: `{ error: { code, message } }`. Export helper `apiError(code, message, status)` returning `NextResponse`.
  - **Files**: `src/lib/api/errors.ts`
  - **Run**: define error codes enum: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `INVALID_MESSAGE`. Export `apiError()` and `validationError(zodError)` helpers.
  - **Verify**: `npm run typecheck` passes

- [x] T020 Create API auth helper in `src/lib/api/auth.ts`
  - **Goal**: Middleware function for admin Route Handlers that reads the Supabase session from cookies, verifies authentication, and extracts user role from `app_metadata`
  - **Files**: `src/lib/api/auth.ts`
  - **Run**: export `requireAuth(request)` → returns `{ user, role }` or throws. Export `requireRole(request, role)` → calls `requireAuth` then checks role. Use `createSessionClient` from T010.
  - **Verify**: `npm run typecheck` passes

- [x] T021 [P] Create rate limiter utility in `src/lib/api/rate-limit.ts`
  - **Goal**: Simple in-memory rate limiter for login and ingestion endpoints. Per-key sliding window.
  - **Files**: `src/lib/api/rate-limit.ts`
  - **Run**: export `createRateLimiter({ windowMs, maxRequests })` returning a function `check(key) → { allowed: boolean, retryAfter?: number }`. Use a `Map<string, number[]>` with cleanup.
  - **Verify**: `npm run typecheck` passes

- [x] T022 Create Next.js middleware for admin route protection in `src/middleware.ts`
  - **Goal**: Protect `/admin/*` pages (except `/admin/login`) — redirect unauthenticated users to `/admin/login`
  - **Files**: `src/middleware.ts`
  - **Run**: use `@supabase/ssr` to read session from request cookies. If no session and path starts with `/admin` (but not `/admin/login`), redirect to `/admin/login`. Export `config.matcher` for `/admin/:path*`.
  - **Verify**: `npm run build` passes

- [x] T023 Set up TanStack Query provider in `src/app/providers.tsx`
  - **Goal**: Create a client-side providers wrapper with `QueryClientProvider` for use in the root layout
  - **Files**: `src/app/providers.tsx`, `src/app/layout.tsx` (wrap children with `<Providers>`)
  - **Run**: create `Providers` component with `"use client"`, configure `QueryClient` with default `staleTime` and `refetchInterval` (will be overridden per-query)
  - **Verify**: `npm run build` passes

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: US1 + US2 — Route Status, Next Stop & Location Link (Priority: P1) MVP

**Goal**: Public dashboard showing route list with Running/Not running status, next scheduled stop, and live location link CTA. This is the core value proposition.

**Independent Test**: Open app on mobile browser → see route list with status badges → tap a route → see schedule with next stop highlighted and "Open location link" button. If location not updated today, see warning.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-021, FR-023, FR-028, FR-030

### API Layer

- [ ] T024 [US1] Implement GET /api/routes endpoint in `src/app/api/routes/route.ts`
  - **Goal**: Return all routes with computed fields (isRunning, nextStop, scheduleStatus, van location info, serverTime) per public-api.md contract
  - **Files**: `src/app/api/routes/route.ts`
  - **Run**: query routes joined with vans and schedule_entries using service client. Compute `isRunning` (schedule window + today's location), `nextStop` (first entry >= now), `scheduleStatus`, `isLocationOutdated` using helpers from `src/lib/time.ts`. Return `serverTime` as HH:mm.
  - **Verify**: `npm run typecheck` passes; manual — `curl http://localhost:3000/api/routes` returns expected JSON shape

- [ ] T025 [US1] Implement GET /api/routes/:routeId endpoint in `src/app/api/routes/[routeId]/route.ts`
  - **Goal**: Return single route detail with full schedule array and all computed fields per public-api.md contract
  - **Files**: `src/app/api/routes/[routeId]/route.ts`
  - **Run**: same computation as T024 but for a single route. Include `schedule` array sorted by time ASC. Return 404 if route not found.
  - **Verify**: `npm run typecheck` passes; manual — `curl http://localhost:3000/api/routes/<uuid>` returns expected JSON shape

### Query Hooks

- [ ] T026 [P] [US1] Create TanStack Query hooks in `src/lib/queries/use-routes.ts` and `src/lib/queries/use-route-detail.ts`
  - **Goal**: React hooks for fetching route list (60s polling) and route detail (30s polling) from the public API
  - **Files**: `src/lib/queries/use-routes.ts`, `src/lib/queries/use-route-detail.ts`
  - **Run**: `useRoutes()` fetches GET /api/routes with `refetchInterval: 60_000`. `useRouteDetail(routeId)` fetches GET /api/routes/:routeId with `refetchInterval: 30_000`. Both return typed data.
  - **Verify**: `npm run typecheck` passes

### UI Components

- [ ] T027 [P] [US1] Create route-status-badge component in `src/components/public/route-status-badge.tsx`
  - **Goal**: Badge showing "Em operação" (green) or "Fora de operação" (gray) based on `isRunning` boolean
  - **Files**: `src/components/public/route-status-badge.tsx`
  - **Run**: use shadcn Badge with variant based on isRunning. Text in pt-BR. Minimum 44px touch target height.
  - **Verify**: `npm run build` passes

- [ ] T028 [P] [US1] Create next-stop-display component in `src/components/public/next-stop-display.tsx`
  - **Goal**: Display "Próxima parada programada" with stop name and time, or "Programação encerrada por hoje" if schedule ended. Include note to check location link (FR-005).
  - **Files**: `src/components/public/next-stop-display.tsx`
  - **Run**: accept `nextStop` (nullable) and `scheduleStatus` props. Show appropriate message per status. All text in pt-BR.
  - **Verify**: `npm run build` passes

- [ ] T029 [P] [US2] Create location-link-cta component in `src/components/public/location-link-cta.tsx`
  - **Goal**: Primary CTA button "Abrir localização" that opens the van's location URL. Show "Última atualização: <time>" and "Localização não atualizada hoje" warning when outdated (FR-004).
  - **Files**: `src/components/public/location-link-cta.tsx`
  - **Run**: accept `locationUrl`, `locationUpdatedAt`, `isLocationOutdated` props. Button opens URL in new tab. 44px min touch target.
  - **Verify**: `npm run build` passes

- [ ] T030 [P] [US1] Create schedule-list component in `src/components/public/schedule-list.tsx`
  - **Goal**: Ordered list of schedule entries (stop name + HH:mm time) with the next stop visually highlighted
  - **Files**: `src/components/public/schedule-list.tsx`
  - **Run**: accept `schedule` array and `nextStopId` (nullable). Render entries sorted by time. Highlight entry matching nextStopId. Show "Nenhum horário disponível" if empty.
  - **Verify**: `npm run build` passes

- [ ] T031 [US1] Create route-card component in `src/components/public/route-card.tsx`
  - **Goal**: Tappable card for route list showing route name, status badge, and next stop preview. Links to route detail page.
  - **Files**: `src/components/public/route-card.tsx`
  - **Run**: use shadcn Card. Include `RouteStatusBadge` (T027) and condensed next stop info. Wrap in Next.js `Link` to `/routes/:routeId`. 44px min touch target.
  - **Verify**: `npm run build` passes

- [ ] T032 [P] [US1] Create bottom-nav component in `src/components/public/bottom-nav.tsx`
  - **Goal**: Persistent bottom navigation with "Rotas" and "Avisos" tabs (FR-029). Active tab highlighted.
  - **Files**: `src/components/public/bottom-nav.tsx`
  - **Run**: fixed bottom bar with two navigation items using Next.js `Link`. Use `usePathname()` to determine active tab. 44px min touch targets. pt-BR labels.
  - **Verify**: `npm run build` passes

### Pages

- [ ] T033 [US1] Create public layout in `src/app/(public)/layout.tsx`
  - **Goal**: Shared layout for all public pages with bottom navigation and responsive container
  - **Files**: `src/app/(public)/layout.tsx`
  - **Run**: render `BottomNav` (T032) and a main content area with mobile-first padding. Set page metadata (title "CAAB Vans").
  - **Verify**: `npm run build` passes

- [ ] T034 [US1] Create home page (route list) in `src/app/(public)/page.tsx`
  - **Goal**: Home screen displaying all routes as tappable cards with status (FR-001). Entry point of the app.
  - **Files**: `src/app/(public)/page.tsx`
  - **Run**: `"use client"` page using `useRoutes()` hook (T026). Map routes to `RouteCard` components (T031). Handle loading (show message) and error states (show message). Show "Nenhuma rota configurada" if empty.
  - **Verify**: `npm run build` passes; manual — visit `http://localhost:3000` and confirm route list renders

- [ ] T035 [US1] Create route detail page in `src/app/(public)/routes/[routeId]/page.tsx`
  - **Goal**: Route detail showing schedule list, next stop, location link CTA, and back button (FR-028). Core user journey endpoint.
  - **Files**: `src/app/(public)/routes/[routeId]/page.tsx`
  - **Run**: `"use client"` page using `useRouteDetail(routeId)` hook (T026). Compose: back button, route name + status badge, `NextStopDisplay` (T028), `LocationLinkCta` (T029), `ScheduleList` (T030). Handle loading and error states.
  - **Verify**: `npm run build` passes; manual — visit `http://localhost:3000/routes/<uuid>` and confirm detail renders

**Checkpoint**: US1+US2 complete. Core user flow works: Home → Route Detail → Location Link.

---

## Phase 4: US3 — Announcements (Priority: P2)

**Goal**: Public announcements section showing operational messages sorted by pinned status then recency.

**Independent Test**: Open announcements tab → see pinned items first, newest-first within groups → urgent items have distinct styling → expired announcements hidden.

**Covers**: FR-006, FR-007, FR-008, FR-029

### API Layer

- [ ] T036 [US3] Implement GET /api/announcements endpoint in `src/app/api/announcements/route.ts`
  - **Goal**: Return active (non-expired) announcements sorted by isPinned DESC, createdAt DESC per public-api.md
  - **Files**: `src/app/api/announcements/route.ts`
  - **Run**: query announcements using service client. Filter where `expires_at IS NULL OR expires_at > now()`. Sort by `is_pinned DESC, created_at DESC`. Map snake_case to camelCase in response.
  - **Verify**: `npm run typecheck` passes; manual — `curl http://localhost:3000/api/announcements` returns expected JSON

### Query Hook

- [ ] T037 [P] [US3] Create TanStack Query hook in `src/lib/queries/use-announcements.ts`
  - **Goal**: React hook for fetching announcements with 60s polling
  - **Files**: `src/lib/queries/use-announcements.ts`
  - **Run**: `useAnnouncements()` fetches GET /api/announcements with `refetchInterval: 60_000`. Returns typed announcement array.
  - **Verify**: `npm run typecheck` passes

### UI + Page

- [ ] T038 [P] [US3] Create announcement-card component in `src/components/public/announcement-card.tsx`
  - **Goal**: Card displaying announcement title, body, pinned indicator, and distinct urgent styling (FR-008)
  - **Files**: `src/components/public/announcement-card.tsx`
  - **Run**: use shadcn Card. Show pin icon if pinned. Apply red/warning border or background if urgent. Display relative time "Publicado em <date>". All text pt-BR.
  - **Verify**: `npm run build` passes

- [ ] T039 [US3] Create announcements page in `src/app/(public)/announcements/page.tsx`
  - **Goal**: List all active announcements with empty state "Nenhum aviso no momento" (FR-006, FR-007)
  - **Files**: `src/app/(public)/announcements/page.tsx`
  - **Run**: `"use client"` page using `useAnnouncements()` hook (T037). Map to `AnnouncementCard` components (T038). Handle loading and error states. Show empty message when no announcements.
  - **Verify**: `npm run build` passes; manual — visit `http://localhost:3000/announcements` and confirm list renders

**Checkpoint**: US3 complete. Public app fully functional (routes + announcements).

---

## Phase 5: US4 — Admin: Manage Routes, Schedules & Announcements (Priority: P3)

**Goal**: Admin panel with login, route/schedule CRUD, and announcement CRUD. Changes reflected in public app.

**Independent Test**: Log in as admin → create a route with schedule → create an announcement → verify changes appear in public app.

**Covers**: FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-022, FR-024, FR-027

### Auth

- [ ] T040 [US4] Implement POST /api/admin/auth/login in `src/app/api/admin/auth/login/route.ts`
  - **Goal**: Admin login endpoint using Supabase Auth. Validate credentials, check `is_active` in app_metadata, set session cookies. Apply rate limiting (FR-022).
  - **Files**: `src/app/api/admin/auth/login/route.ts`
  - **Run**: parse body with Zod (email + password). Call `supabase.auth.signInWithPassword()` via session client. Check `app_metadata.is_active !== false`. Return user object with role. Use rate limiter (T021) keyed by email.
  - **Verify**: `npm run typecheck` passes; manual — `curl -X POST /api/admin/auth/login` with credentials

- [ ] T041 [US4] Create admin login page in `src/app/admin/login/page.tsx`
  - **Goal**: Email/password login form that posts to the login API and redirects to `/admin` on success
  - **Files**: `src/app/admin/login/page.tsx`
  - **Run**: `"use client"` page with controlled form. On submit, POST to `/api/admin/auth/login`. On success, `router.push('/admin')`. Show error message on failure. All labels in pt-BR.
  - **Verify**: `npm run build` passes

### Layout

- [ ] T042 [P] [US4] Create admin sidebar-nav component in `src/components/admin/sidebar-nav.tsx`
  - **Goal**: Sidebar navigation with links: Rotas, Avisos, Usuários (superuser only). Active link highlighted.
  - **Files**: `src/components/admin/sidebar-nav.tsx`
  - **Run**: accept `role` prop. Show "Usuários" link only if role is `superuser`. Use `usePathname()` for active state. Links: `/admin/vans`, `/admin/routes`, `/admin/announcements`, `/admin/users`.
  - **Verify**: `npm run build` passes

- [ ] T043 [US4] Create admin layout in `src/app/admin/layout.tsx`
  - **Goal**: Admin shell with sidebar navigation and user info. Reads session server-side to get role for sidebar rendering.
  - **Files**: `src/app/admin/layout.tsx`
  - **Run**: server component that reads session via `createSessionClient`. Pass role to `SidebarNav` (T042). Include logout button. Render children in main content area. For `/admin/login` path, render children without sidebar (handled by middleware redirects).
  - **Verify**: `npm run build` passes

- [ ] T044 [US4] Create admin dashboard redirect in `src/app/admin/page.tsx`
  - **Goal**: Redirect `/admin` to `/admin/routes` (default admin landing page)
  - **Files**: `src/app/admin/page.tsx`
  - **Run**: server component using `redirect('/admin/routes')` from `next/navigation`
  - **Verify**: `npm run build` passes

### Vans CRUD (prerequisite for routes — vans must exist before routes can reference them)

- [ ] T044a [US4] Implement admin vans API in `src/app/api/admin/vans/route.ts` and `src/app/api/admin/vans/[vanId]/route.ts`
  - **Goal**: GET list all vans, POST create van (auto-generate ingestion_token), PUT update van name / regenerate token, DELETE van (409 if assigned to a route). Per admin-api.md vans contract.
  - **Files**: `src/app/api/admin/vans/route.ts` (GET, POST), `src/app/api/admin/vans/[vanId]/route.ts` (PUT, DELETE)
  - **Run**: use `requireAuth` (T020). Validate name inline (non-empty, max 100 chars) with Zod. POST: insert with `crypto.randomUUID()` for `ingestion_token`. PUT: update name and/or regenerate token. DELETE: check no route references this van_id (409 if assigned), then hard delete. Use service client.
  - **Verify**: `npm run typecheck` passes; manual — curl GET/POST/PUT/DELETE requests

- [ ] T044b [P] [US4] Create van-form component in `src/components/admin/van-form.tsx`
  - **Goal**: Simple form for creating/editing a van with name input
  - **Files**: `src/components/admin/van-form.tsx`
  - **Run**: accept optional `defaultValues` and `onSubmit`. Use shadcn Input for name. Client-side Zod validation (non-empty, max 100 chars). pt-BR labels.
  - **Verify**: `npm run build` passes

- [ ] T044c [US4] Create admin vans list page in `src/app/admin/vans/page.tsx`
  - **Goal**: Table listing all vans with name, ingestion token (masked), location status, and edit/delete actions. Empty state "Nenhuma van cadastrada. Crie uma." (FR-027). Shows ingestion webhook URL for Pabbly config.
  - **Files**: `src/app/admin/vans/page.tsx`
  - **Run**: `"use client"` page. Fetch GET /api/admin/vans. Display in shadcn Table: Name, Token (masked with copy button), Last Location Update, Actions. Delete with confirmation Dialog (warn if assigned to route).
  - **Verify**: `npm run build` passes

- [ ] T044d [US4] Create admin van create page in `src/app/admin/vans/new/page.tsx`
  - **Goal**: Page with van form that POSTs to admin vans API. Shows generated ingestion token and webhook URL on success.
  - **Files**: `src/app/admin/vans/new/page.tsx`
  - **Run**: `"use client"` page using `VanForm` (T044b). On submit, POST to `/api/admin/vans`. On success, display the generated `ingestionToken` and full webhook URL (`/api/ingest/:vanId`) for Pabbly configuration, then allow redirect to `/admin/vans`.
  - **Verify**: `npm run build` passes

### Routes CRUD

- [ ] T045 [US4] Implement admin routes API in `src/app/api/admin/routes/route.ts` and `src/app/api/admin/routes/[routeId]/route.ts`
  - **Goal**: POST create route, PUT update route, DELETE hard delete route per admin-api.md. Validate with Zod. Check auth + admin role.
  - **Files**: `src/app/api/admin/routes/route.ts` (POST), `src/app/api/admin/routes/[routeId]/route.ts` (PUT, DELETE)
  - **Run**: use `requireAuth` (T020) for all handlers. Validate body with route schema (T013). POST: insert route + check van uniqueness (409 on conflict). PUT: update by id (404 if missing). DELETE: hard delete (204). Use service client.
  - **Verify**: `npm run typecheck` passes; manual — curl POST/PUT/DELETE requests

- [ ] T046 [P] [US4] Create route-form component in `src/components/admin/route-form.tsx`
  - **Goal**: Reusable form for creating/editing routes with name input and van selector
  - **Files**: `src/components/admin/route-form.tsx`
  - **Run**: accept optional `defaultValues` for edit mode and `onSubmit` callback. Use shadcn Input for name, Select for van dropdown. Client-side Zod validation before submit. Show validation errors. pt-BR labels.
  - **Verify**: `npm run build` passes

- [ ] T047 [US4] Create admin routes list page in `src/app/admin/routes/page.tsx`
  - **Goal**: Table listing all routes with edit/delete actions. Empty state "Nenhuma rota cadastrada. Crie uma." (FR-027)
  - **Files**: `src/app/admin/routes/page.tsx`
  - **Run**: `"use client"` page. Fetch GET /api/admin/routes (or reuse public endpoint). Display in shadcn Table with columns: Name, Van, Actions (Edit link, Delete button). Delete with confirmation Dialog. Show empty state when no routes.
  - **Verify**: `npm run build` passes

- [ ] T048 [US4] Create admin route create page in `src/app/admin/routes/new/page.tsx`
  - **Goal**: Page with route form that POSTs to admin routes API and redirects to routes list on success
  - **Files**: `src/app/admin/routes/new/page.tsx`
  - **Run**: `"use client"` page using `RouteForm` (T046). On submit, POST to `/api/admin/routes`. On success, redirect to `/admin/routes`. Show error on failure.
  - **Verify**: `npm run build` passes

- [ ] T049 [US4] Create admin route edit page in `src/app/admin/routes/[routeId]/page.tsx`
  - **Goal**: Page with pre-filled route form that PUTs to admin routes API. Also hosts the schedule editor (integrated in T052).
  - **Files**: `src/app/admin/routes/[routeId]/page.tsx`
  - **Run**: `"use client"` page. Fetch route data, pass to `RouteForm` (T046) as default values. On submit, PUT to `/api/admin/routes/:routeId`. Show schedule editor section below the form (placeholder until T052).
  - **Verify**: `npm run build` passes

### Schedule CRUD

- [ ] T050 [US4] Implement admin schedule API in `src/app/api/admin/routes/[routeId]/schedule/route.ts` and `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts`
  - **Goal**: GET list entries, POST create entry, PUT update entry, DELETE entry per admin-api.md. Enforce unique (route_id, time) constraint (FR-013).
  - **Files**: `src/app/api/admin/routes/[routeId]/schedule/route.ts` (GET, POST), `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts` (PUT, DELETE)
  - **Run**: use `requireAuth` (T020). Validate with schedule-entry schema (T013). GET: return entries sorted by time. POST: insert, return 409 on duplicate time. PUT: update by id. DELETE: hard delete (204). Use service client.
  - **Verify**: `npm run typecheck` passes; manual — curl requests

- [ ] T051 [US4] Create schedule-editor component in `src/components/admin/schedule-editor.tsx`
  - **Goal**: Inline editor for a route's schedule entries: add/edit/remove entries with stop name + HH:mm time. Entries auto-sorted by time (FR-014).
  - **Files**: `src/components/admin/schedule-editor.tsx`
  - **Run**: accept `routeId` prop. Fetch entries via GET /api/admin/routes/:routeId/schedule. Display as editable list. Add button appends a new entry form row. Each row has: stop name Input, time Input (HH:mm), Save button, Delete button. Show validation error on duplicate time (FR-013). pt-BR labels.
  - **Verify**: `npm run build` passes

- [ ] T052 [US4] Integrate schedule editor into route edit page
  - **Goal**: Add the schedule editor component below the route form on the edit page
  - **Files**: `src/app/admin/routes/[routeId]/page.tsx` (update from T049)
  - **Run**: import `ScheduleEditor` (T051) and render below the route form, passing `routeId`. Add section heading "Horários".
  - **Verify**: `npm run build` passes; manual — edit a route and verify schedule editor appears and works

### Announcements CRUD

- [ ] T053 [US4] Implement admin announcements API in `src/app/api/admin/announcements/route.ts` and `src/app/api/admin/announcements/[announcementId]/route.ts`
  - **Goal**: POST create, PUT update, DELETE hard delete announcement per admin-api.md. Validate with Zod.
  - **Files**: `src/app/api/admin/announcements/route.ts` (POST), `src/app/api/admin/announcements/[announcementId]/route.ts` (PUT, DELETE)
  - **Run**: use `requireAuth` (T020). Validate body with announcement schema (T014). POST: insert. PUT: update by id (404 if missing). DELETE: hard delete (204). Validate `expires_at` is in the future if set.
  - **Verify**: `npm run typecheck` passes

- [ ] T054 [P] [US4] Create announcement-form component in `src/components/admin/announcement-form.tsx`
  - **Goal**: Reusable form for creating/editing announcements: title, body (textarea), pinned switch, urgent switch, optional expiry datetime
  - **Files**: `src/components/admin/announcement-form.tsx`
  - **Run**: accept optional `defaultValues` and `onSubmit`. Use shadcn Input (title), Textarea (body), Switch (pinned, urgent), Input type datetime-local (expiresAt). Client-side Zod validation. pt-BR labels.
  - **Verify**: `npm run build` passes

- [ ] T055 [US4] Create admin announcements list page in `src/app/admin/announcements/page.tsx`
  - **Goal**: Table listing all announcements with edit/delete actions. Empty state "Nenhum aviso cadastrado. Crie um." (FR-027)
  - **Files**: `src/app/admin/announcements/page.tsx`
  - **Run**: `"use client"` page. Fetch announcements (including expired, for admin view). Display in shadcn Table: Title, Pinned, Urgent, Expires, Actions. Delete with confirmation Dialog. Empty state.
  - **Verify**: `npm run build` passes

- [ ] T056 [US4] Create admin announcement create page in `src/app/admin/announcements/new/page.tsx`
  - **Goal**: Page with announcement form that POSTs to admin API and redirects on success
  - **Files**: `src/app/admin/announcements/new/page.tsx`
  - **Run**: `"use client"` page using `AnnouncementForm` (T054). On submit, POST to `/api/admin/announcements`. Redirect to `/admin/announcements` on success.
  - **Verify**: `npm run build` passes

- [ ] T057 [US4] Create admin announcement edit page in `src/app/admin/announcements/[announcementId]/page.tsx`
  - **Goal**: Page with pre-filled announcement form that PUTs to admin API
  - **Files**: `src/app/admin/announcements/[announcementId]/page.tsx`
  - **Run**: `"use client"` page. Fetch announcement data, pass to `AnnouncementForm` (T054). On submit, PUT to `/api/admin/announcements/:announcementId`. Redirect on success.
  - **Verify**: `npm run build` passes

**Checkpoint**: US4 complete. Admin can manage all content. Changes visible in public app.

---

## Phase 6: US5 — Superuser: Manage Admin Accounts (Priority: P3)

**Goal**: Superuser-only user management: create admins, reset passwords, deactivate/reactivate.

**Independent Test**: Log in as superuser → create a new admin → verify new admin can log in. Log in as regular admin → confirm no access to user management.

**Covers**: FR-016, FR-017

- [ ] T058 [US5] Implement admin users API in `src/app/api/admin/users/route.ts` and `src/app/api/admin/users/[userId]/route.ts`
  - **Goal**: GET list users, POST create user, PUT update user (role/password/isActive) per admin-api.md. Superuser only (403 for admin role). Prevent last superuser deactivation (FR-017).
  - **Files**: `src/app/api/admin/users/route.ts` (GET, POST), `src/app/api/admin/users/[userId]/route.ts` (PUT)
  - **Run**: use `requireRole(request, 'superuser')` (T020). GET: list all users from `auth.admin.listUsers()`, map to response shape. POST: `auth.admin.createUser()` with `app_metadata: { role, is_active: true }`. PUT: `auth.admin.updateUserById()` for role/password/isActive changes. Before deactivation, count active superusers and reject if this is the last one.
  - **Verify**: `npm run typecheck` passes; manual — curl requests as superuser and as admin (expect 403)

- [ ] T059 [P] [US5] Create user-form component in `src/components/admin/user-form.tsx`
  - **Goal**: Form for creating/editing users: email, password, role selector (admin/superuser)
  - **Files**: `src/components/admin/user-form.tsx`
  - **Run**: accept optional `defaultValues` (no password for edit), `isEdit` flag, and `onSubmit`. Use shadcn Input (email, password), Select (role). For edit mode: password field optional (only if changing). Client-side Zod validation. pt-BR labels.
  - **Verify**: `npm run build` passes

- [ ] T060 [US5] Create admin users list page in `src/app/admin/users/page.tsx`
  - **Goal**: Table listing all admin users with status and actions. Empty state. Superuser guard in UI.
  - **Files**: `src/app/admin/users/page.tsx`
  - **Run**: `"use client"` page. Fetch GET /api/admin/users. Display in shadcn Table: Email, Role, Active, Actions (Edit link). Include "Create user" button. Handle 403 gracefully (redirect or show forbidden message).
  - **Verify**: `npm run build` passes

- [ ] T061 [US5] Create admin user create page in `src/app/admin/users/new/page.tsx`
  - **Goal**: Page with user form that POSTs to admin users API and redirects on success
  - **Files**: `src/app/admin/users/new/page.tsx`
  - **Run**: `"use client"` page using `UserForm` (T059). On submit, POST to `/api/admin/users`. Redirect to `/admin/users` on success. Show error on failure (duplicate email → 409).
  - **Verify**: `npm run build` passes

- [ ] T061a [US5] Create admin user edit page in `src/app/admin/users/[userId]/page.tsx`
  - **Goal**: Page for editing user role, resetting password, and deactivating/reactivating a user (US5 acceptance scenario 1)
  - **Files**: `src/app/admin/users/[userId]/page.tsx`
  - **Run**: `"use client"` page. Fetch user data via GET /api/admin/users (filter client-side by userId). Pass to `UserForm` (T059) with `isEdit=true` (password optional). Include a deactivate/reactivate Switch with confirmation Dialog. On submit, PUT to `/api/admin/users/:userId`. Redirect to `/admin/users` on success.
  - **Verify**: `npm run build` passes; manual — edit a user's role and deactivate/reactivate

**Checkpoint**: US5 complete. Full RBAC in place.

---

## Phase 7: US6 — Location Ingestion from Telegram via Pabbly (Priority: P3)

**Goal**: Webhook endpoint that receives Telegram messages from Pabbly, extracts a single URL, and stores it as the van's location link.

**Independent Test**: `curl -X POST /api/ingest/:vanId -H "X-Ingestion-Token: <token>" -d '{"message":"Check https://maps.app.goo.gl/abc"}'` → 200 with locationUrl. Send zero or multiple URLs → 400. Bad token → 401.

**Covers**: FR-018, FR-019, FR-020, FR-022

- [ ] T062 [P] [US6] Create URL extraction utility in `src/lib/url-extractor.ts`
  - **Goal**: Pure function that extracts URLs from a text string. Returns array of found URLs.
  - **Files**: `src/lib/url-extractor.ts`
  - **Run**: export `extractUrls(text: string): string[]` using a standard URL regex. Must handle common formats: https://, http://, maps.app.goo.gl links.
  - **Verify**: `npm run typecheck` passes

- [ ] T063 [US6] Implement POST /api/ingest/:vanId endpoint in `src/app/api/ingest/[vanId]/route.ts`
  - **Goal**: Receive Pabbly webhook, validate token, extract exactly one URL, update van's location per ingestion-api.md
  - **Files**: `src/app/api/ingest/[vanId]/route.ts`
  - **Run**: read `X-Ingestion-Token` header. Look up van by `vanId`, verify token matches `ingestion_token` (401 if not). Parse body with ingestion schema (T014). Extract URLs with utility (T062). If count != 1, return 400 `INVALID_MESSAGE`. If count == 1, update van's `location_url` and `location_updated_at` to now (America/Bahia). Apply rate limiter (T021) keyed by vanId. Return `{ locationUrl, updatedAt }`.
  - **Verify**: `npm run typecheck` passes; manual — curl with valid/invalid payloads

**Checkpoint**: US6 complete. Location ingestion pipeline works end-to-end.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: UX polish, accessibility compliance, and final quality validation.

- [ ] T064 Add skeleton loading states to all public pages (FR-025)
  - **Goal**: Replace any blank loading states with skeleton placeholders on home page and route detail page
  - **Files**: `src/app/(public)/page.tsx`, `src/app/(public)/routes/[routeId]/page.tsx`, `src/app/(public)/announcements/page.tsx`
  - **Run**: use shadcn Skeleton component. Home page: render 3-4 skeleton cards. Route detail: skeleton for header, schedule list, and CTA button. Announcements: skeleton cards.
  - **Verify**: `npm run build` passes; manual — throttle network in DevTools, confirm skeletons appear (no blank screens)

- [ ] T065 Add error + retry states to all public pages (FR-026)
  - **Goal**: Show inline error message with retry button when data fetching fails
  - **Files**: `src/app/(public)/page.tsx`, `src/app/(public)/routes/[routeId]/page.tsx`, `src/app/(public)/announcements/page.tsx`
  - **Run**: check `isError` from TanStack Query hooks. Display "Não foi possível carregar. Toque para tentar novamente." with a retry button that calls `refetch()`. Use shadcn Alert component.
  - **Verify**: `npm run build` passes; manual — disconnect API/network, confirm error state appears with retry

- [ ] T066 Add empty states to all admin list pages (FR-027)
  - **Goal**: Verify all admin list pages show a helpful empty state with a create prompt
  - **Files**: `src/app/admin/routes/page.tsx`, `src/app/admin/announcements/page.tsx`, `src/app/admin/users/page.tsx`
  - **Run**: review each list page. Ensure empty state shows: icon or illustration, message in pt-BR, and a link/button to the create page. (Most should already be done in Phase 5/6 tasks — this task verifies and fills gaps.)
  - **Verify**: `npm run build` passes; manual — confirm empty states appear when no records exist

- [ ] T067 Accessibility audit: touch targets and contrast (FR-030, FR-031)
  - **Goal**: Verify all interactive elements meet 44x44 CSS px touch targets and WCAG 2.1 AA contrast ratios
  - **Files**: all component files in `src/components/public/` and `src/components/admin/`
  - **Run**: use browser DevTools (Lighthouse accessibility audit) or manual inspection. Check all buttons, links, and tappable elements for min 44px size. Check text contrast with a contrast checker tool. Fix any violations.
  - **Verify**: Lighthouse accessibility score >= 90; manual spot-check on mobile viewport

- [ ] T067a Add location link click event tracking (SC-004)
  - **Goal**: Track `open_location_link_clicked` events when users tap the location link CTA, enabling SC-004 click-through rate measurement
  - **Files**: `src/components/public/location-link-cta.tsx` (update from T029), `src/app/api/track/route.ts` (new)
  - **Run**: add an `onClick` handler to the CTA button that fires a lightweight tracking event before opening the URL. Create a minimal `POST /api/track` endpoint that logs the event (for MVP, `console.log` with event name + timestamp is sufficient; can be upgraded to DB insert later). Use `navigator.sendBeacon` for non-blocking delivery.
  - **Verify**: `npm run build` passes; manual — click location link, confirm event logged in server console

- [ ] T068 Run full quality gate checks
  - **Goal**: Ensure all four quality gates pass (Constitution §IV)
  - **Files**: none (validation only)
  - **Run**: `npm run lint && npm run typecheck && npm run build && npm run test`
  - **Verify**: all four commands exit with code 0

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1+US2)**: Depends on Phase 2 completion
- **Phase 4 (US3)**: Depends on Phase 2; can run in parallel with Phase 3
- **Phase 5 (US4)**: Depends on Phase 2; can run in parallel with Phase 3/4
- **Phase 6 (US5)**: Depends on Phase 5 (admin layout and auth must exist)
- **Phase 7 (US6)**: Depends on Phase 2; can run in parallel with Phase 3-6
- **Phase 8 (Polish)**: Depends on all story phases being complete

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|-----------|-------------------|
| US1+US2 (Phase 3) | Phase 2 only | US3, US4, US6 |
| US3 (Phase 4) | Phase 2 only | US1+US2, US4, US6 |
| US4 (Phase 5) | Phase 2 only | US1+US2, US3, US6 |
| US5 (Phase 6) | US4 (Phase 5) | — |
| US6 (Phase 7) | Phase 2 only | US1+US2, US3, US4 |

### Within Each Phase (Sequential Order)

1. API endpoints → Query hooks → UI components → Pages
2. Form components can be built in parallel with API endpoints [P]
3. Layout must precede pages

### Parallel Opportunities per Phase

**Phase 2**: T009–T014 all [P] (different files). T019, T021 [P].
**Phase 3**: T026–T030, T032 all [P] (independent components). T024–T025 sequential (shared computation logic).
**Phase 4**: T037, T038 [P] (hook + component). T036 first (API).
**Phase 5**: T046, T054 [P] (form components). API tasks sequential per entity.
**Phase 7**: T062 [P] (utility), then T063 (endpoint uses utility).

---

## Parallel Example: Phase 3 (US1+US2)

```text
# Step 1: API endpoints (sequential — shared computation pattern)
T024: GET /api/routes
T025: GET /api/routes/:routeId

# Step 2: All independent components + hooks (parallel)
T026: TanStack Query hooks
T027: route-status-badge
T028: next-stop-display
T029: location-link-cta
T030: schedule-list
T032: bottom-nav

# Step 3: Composed components (needs T027)
T031: route-card

# Step 4: Layout + Pages (sequential)
T033: Public layout
T034: Home page
T035: Route detail page
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (BLOCKS all stories)
3. Complete Phase 3: US1+US2 — Route Status + Location Link
4. **STOP and VALIDATE**: Home → route list → route detail → location link works
5. Deploy to DEV for stakeholder review

### Incremental Delivery (Recommended)

1. Phase 1 + Phase 2 → Foundation ready
2. Phase 3 (US1+US2) → **MVP deployed** (core value)
3. Phase 4 (US3) → Announcements added
4. Phase 5 (US4) → Admin can manage content
5. Phase 6 (US5) → User management for governance
6. Phase 7 (US6) → Location ingestion automated
7. Phase 8 → Polish and quality hardening

### Notes

- [P] tasks = different files, no dependencies on pending tasks
- [Story] label maps task to its user story for traceability
- Each phase checkpoint = independently testable increment
- Commit after each task or logical group
- All user-facing text in Portuguese (pt-BR); code/comments in English
