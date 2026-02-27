# Research: MVP Vans Dashboard

**Branch**: `001-mvp-dashboard` | **Date**: 2026-02-26

## Overview

The tech stack is fully locked by the constitution and TECH.md. No NEEDS
CLARIFICATION items exist. This document records the key architectural
decisions and their rationale.

## Decisions

### 1. Single Next.js App (Public + Admin)

**Decision**: One Next.js App Router application serves both the public
dashboard and the admin panel using route groups.

**Rationale**: KISS — a single deployment, single build, shared types and
validation schemas. The admin panel is low-traffic (~2 users) and doesn't
justify a separate application.

**Alternatives considered**:
- Separate apps for public and admin → rejected (over-engineering for MVP,
  doubles deployment complexity).
- Supabase Studio for admin → rejected (doesn't support custom computed
  fields, schedule validation, or RBAC constraints).

### 2. BFF Pattern via Route Handlers

**Decision**: All data access goes through Next.js Route Handlers (`/api/*`).
Public pages call public endpoints; admin pages call admin endpoints.

**Rationale**: Constitution mandates computed fields (status, next stop) in
the BFF for consistency. Route Handlers run server-side and can use the
service role key safely.

**Alternatives considered**:
- Direct Supabase client from browser (anon key + RLS) → rejected for public
  pages because status computation needs server-side time and multi-table
  joins. May be used for future mobile clients.
- Supabase Edge Functions → explicitly forbidden by constitution.

### 3. Supabase Auth for Admin Authentication

**Decision**: Use Supabase Auth (email/password) for admin login. Store role
in `raw_app_meta_data` via service role key.

**Rationale**: Supabase Auth is already part of the self-hosted stack. No
additional auth service needed. `app_metadata` is not editable by users
(only by service role), making it safe for RBAC.

**Alternatives considered**:
- Custom JWT auth → rejected (reinventing the wheel; Supabase Auth provides
  session management, password hashing, rate limiting out of the box).
- Separate `profiles` table for roles → rejected for MVP (adds a join and
  sync concern; `app_metadata` is simpler).

### 4. RLS Policy Approach

**Decision**: Public read via RLS with anon key. Admin writes enforced at BFF
level (service role key bypasses RLS). RLS provides defense-in-depth.

**Rationale**: The BFF already validates auth and RBAC before writing. RLS on
write operations would duplicate BFF checks. However, RLS on SELECT ensures
that even if a client bypasses the BFF (future mobile app), public data is
still safe.

**RLS policies**:
- `routes`: SELECT for anon, all ops for service role.
- `vans`: SELECT for anon (location fields), all ops for service role.
- `schedule_entries`: SELECT for anon, all ops for service role.
- `announcements`: SELECT for anon WHERE not expired, all ops for service role.

### 5. Per-Van Ingestion Token

**Decision**: Each van has a unique `ingestion_token` stored in the `vans`
table. The Pabbly webhook URL includes the vanId, and the request must
include the matching token in a header (`X-Ingestion-Token`).

**Rationale**: Avoids a single shared secret for all vans (if one leaks, only
one van is affected). Simple to rotate per-van.

**Alternatives considered**:
- Single global shared secret → rejected (blast radius too large).
- HMAC signature verification → rejected (over-engineering for Pabbly
  integration which only supports static headers).

### 6. TanStack Query for Public Data Fetching

**Decision**: Use TanStack Query with polling for public pages. Route list
polls every 60 seconds. Route detail polls every 30 seconds.

**Rationale**: Polling is simpler than Supabase Realtime for MVP. The data
changes infrequently (schedules are static, location links update at most a
few times per day). TanStack Query handles caching, deduplication, and
background refetches.

**Alternatives considered**:
- Supabase Realtime (websockets) → deferred post-MVP (adds complexity for
  marginal benefit given low update frequency).
- No polling (stale until refresh) → rejected (status could change during a
  user session; 60s polling is cheap).

### 7. Luxon for Timezone Handling

**Decision**: All server-side time operations use Luxon with
`America/Bahia` zone. The BFF returns pre-formatted time strings and
computed boolean flags (isRunning, isOutdated).

**Rationale**: Constitution mandates Luxon + America/Bahia. Sending computed
values from BFF avoids client-side timezone bugs.

**Alternatives considered**:
- date-fns-tz → rejected (Luxon is locked in constitution).
- Send raw UTC timestamps and convert client-side → rejected (constitution
  mandates BFF computation for consistency).
