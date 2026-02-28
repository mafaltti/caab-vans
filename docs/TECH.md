# CAAB Vans - Tech Stack & Infra Reference

## 1) Product Context (MVP)

This project implements the MVP described in `docs/PRD-MVP.md`:
- Mobile-first dashboard for CAAB transport status
- Fixed routes/stops + countdowns
- Lightweight filtering

---

## 2) High-Level Architecture

**Multi-client backend (Supabase self-hosted)**, with a **Next.js web app** that includes:
- **Frontend** (portal UI)
- **BFF** (Backend-for-Frontend) via Next.js Route Handlers (`/app/api/*`)

Primary data access pattern:
- Web UI → Next.js BFF (`/api/*`) → Supabase (Postgres)
- (Future) Mobile app may call Supabase directly using anon key + RLS, OR consume the same BFF endpoints.

Non-goal:
- Do NOT use Supabase Edge Functions.

---

## 3) Stack

### 3.1 Web (Frontend + BFF)
- **Next.js (App Router) + TypeScript**
- **Tailwind CSS + shadcn/ui**: shadcn/ui (New York style, Zinc base, Lucide icons, Geist font). See **Design Direction** below.
- **Motion** (smooth transitions and tap feedback)
- **TanStack Query** (polling, caching, request dedupe)
- **Zod** (validation for API inputs and internal ops)
- **Luxon** (timezone correctness; force `America/Bahia`)

#### Design Direction — Clean Utility / Modern Mobile App
Built on shadcn/ui tokens and components; extended with Tailwind utilities for a polished mobile-first feel.

- **Color palette**
  - Backgrounds: soft off-white (`bg-slate-50`) for reduced eye strain.
  - Surfaces/cards: white (`bg-white`) for clear hierarchy.
  - Primary text: high-contrast dark gray (`text-slate-900`); secondary: `text-slate-500`.
  - Primary accent: blue (`blue-600`) for actions and active states.
  - Semantic: emerald green for active/positive states; rose red for urgent/negative states.
- **Typography**
  - Geist Sans (`--font-geist-sans`) as the primary typeface.
  - Hierarchy via font weight (`font-medium`, `font-bold`) and size rather than color variation.
- **Shape & depth**
  - Generous border radii (`rounded-2xl`, `rounded-3xl`) for a friendly, modern feel.
  - Subtle shadows (`shadow-sm`, `shadow-md`) to lift interactive elements without heaviness.
- **Interaction & motion**
  - Motion library for tap feedback (`whileTap={{ scale: 0.96 }}`), screen transitions, and state animations.
  - Keep animations short and purposeful — they should feel native, not decorative.

### 3.2 Backend (Self-hosted Supabase)
- **Supabase official Docker self-host setup** (multi-client capable)
- Components enabled:
  - Postgres
  - Auth
  - Realtime
  - Storage
  - Studio
- Explicit constraint:
  - **Supabase Edge Functions must NOT be used** (skip/disable if present)

### 3.3 Tooling
- ESLint
- Prettier

---

## 4) Infra & Deployment

### 4.1 Infrastructure Model
- **One VPS**
- **Two Docker Compose stacks** (two folders/projects):
  1) `infra/supabase/` — Supabase self-host stack
  2) `infra/app/` — Next.js app stack

- Reverse proxy:
  - **Caddy** as the single public entrypoint (TLS termination + routing)

### 4.2 Networking & Exposure Rules
- Expose to the internet:
  - Caddy (ports 80/443)
  - Supabase API gateway for multi-client direct access
  - Studio should be protected (see Security section)

- Never expose:
  - Postgres port publicly
  - Any internal-only services unintentionally

### 4.3 Domains (suggested)

- `vans.danilocarneiro.com` → Next.js portal (public)
- `api-vans.danilocarneiro.com` → Supabase gateway (public only if multi-client direct access is desired)
- `studio.danilocarneiro.com` → Supabase Studio (must be protected)

---

## 5) Security Model

### 5.1 Supabase (Multi-client)
- Treat the **anon key as public** (it will live in web/mobile clients if used directly).
- All public access must be controlled by:
  - **RLS policies**
  - Auth roles/claims for staff-only write access

### 5.2 Service Role Key
- The **service role key is server-only**:
  - Allowed only in Next.js server runtime (Route Handlers) and secure ops scripts
  - Never shipped to browsers or mobile apps

### 5.3 Studio Access
- Studio must be restricted via Basic auth at Caddy

---

## 6) Time

Timezone:
- Canonical timezone: **America/Bahia**
- All displayed times use `HH:mm` in that timezone.

---

## 7) Data & Computation Responsibilities

### 7.1 Where logic lives
- Computed fields should be consistent:
  - Prefer computing “next stop / isOutdated / status labels” in the **BFF** for consistency across clients.
  - The UI can still run countdown timers locally for smooth updates.

---

## 8) Repository Conventions (recommended)

Suggested layout:
- `docs/`
  - `PRD-MVP.md`
  - `TECH.md` (this file)
- `infra/`
  - `supabase/` (official self-host stack, env files)
  - `caab-vans/` (app compose, caddy config if app owns proxy)
- `apps/` (optional if you go monorepo later)
  - `web/` (Next.js)

---

## 9) Spec Kit Alignment

This file is a reference. In Spec Kit terms:
- `/speckit.constitution` must include:
  - Stack constraints (Next.js + Supabase self-host)
  - “No Edge Functions”
  - Security constraints (service role never in client; Studio protected)
  - Timezone + freshness requirements

- `/speckit.plan` must decide:
  - RLS policy approach for public read vs staff writes
  - Deployment routing in Caddy (domains, paths)
  - Backup strategy for Postgres/Storage volumes

---

## 10) Operational Notes (MVP)

Backups:
- Postgres backups scheduled (daily minimum) + off-box storage
- Storage volume backups if used

Monitoring:
- Basic container health checks
- Alert on DB down / gateway down / app down

---
