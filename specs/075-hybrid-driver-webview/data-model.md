# Data Model: 075 Hybrid Driver WebView

**Date**: 2026-03-17
**Branch**: `075-hybrid-driver-webview`

## Overview

This feature introduces **no new database entities, tables, or schema changes**. It reuses the existing data model entirely.

## Entities Referenced (Unchanged)

### auth.users
- Existing Supabase Auth users with `app_metadata.role` ("admin" | "superuser" | "driver").
- Used by: `/driver/login` authentication, driver layout auth check, middleware role redirect.
- No changes to the auth model.

### vans
- Existing van records with `driver_id` (nullable FK to auth.users).
- Used by: driver route assignment check.
- No changes.

### routes / route_runs / route_run_stops
- Existing route lifecycle (waiting → in_progress → completed).
- Used by: embedded driver web flow (start shift, active route, end shift).
- No changes.

### route_shifts
- Existing shift records (driver_id, started_at, ended_at).
- Used by: embedded driver web flow (start/end shift).
- No changes.

## New Application-Level State (Not Persisted)

### WebView Navigation State (Native App — In-Memory Only)
- `canGoBack: boolean` — tracked via `onNavigationStateChange` and injected history shim.
- `loading: boolean` — tracked via WebView load events.
- `error: string | null` — tracked via WebView error events.
- Not persisted to any storage. Lives only in React component state.

### Keep-Awake State (Native App — In-Memory Only)
- `isActive: boolean` — tracked via AppState listener.
- Controlled by `activateKeepAwakeAsync` / `deactivateKeepAwake`.
- Not persisted. Resets on app restart.

## Configuration State (Existing — Unchanged)

### Tracker Settings (AsyncStorage + SecureStore)
- `apiBaseUrl: string` — used to construct WebView URL (`${apiBaseUrl}/driver`).
- `vanId: string` — unchanged, used for native tracking only.
- `ingestionToken: string` — unchanged, used for native tracking only.
- The "Open Driver" CTA is gated behind `isSettingsComplete()` which requires all three.
