# Implementation Plan: Tracking Reliability Fixes

**Branch**: `071-tracking-fixes` | **Date**: 2026-03-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/071-tracking-fixes/spec.md`

## Summary

Fix three tracking reliability issues identified in RCA doc 0115: (1) break the deferred event retry loop by marking non-adjacent events as `no_match` so devices stop resending them, (2) batch the `.in()` query in `appendGeofenceResponse` and cap geofence events per request to prevent gateway 502 errors, (3) reprocess `no_match` events when a shift is created late so retroactive stop advancement works.

## Technical Context

**Language/Version**: TypeScript ~5.x (Next.js 16 App Router)
**Primary Dependencies**: Supabase JS client, Zod, Luxon
**Storage**: PostgreSQL via Supabase (self-hosted)
**Testing**: Vitest (existing test suite: 843 lines, 17 scenarios for geofence processing)
**Target Platform**: Linux server (Next.js Route Handlers)
**Project Type**: Web service (BFF API routes)
**Performance Goals**: Tracking API response < 500ms even with 100 geofence events
**Constraints**: Kong gateway 4KB header / 8KB buffer limits; no database migrations
**Scale/Scope**: 4 vans, ~20-50 events/shift normal, up to 300+ under bug conditions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Design | Post-Design | Notes |
|-----------|-----------|-------------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | PASS | All fixes are minimal targeted changes. No new abstractions. Issue 3 is 1 line. Issue 4B reuses existing batch pattern. Issue 2 reuses existing `processDeviceGeofenceEvents`. |
| II. Explicit Trade-offs | PASS | PASS | PR will document: keeping `no_match` status vs. new `deferred` status (simpler), batching vs. RPC (simpler), sync reprocessing vs. cron (simpler). |
| III. Branch & Merge | PASS | PASS | Feature branch `071-tracking-fixes` targeting `dev`. |
| IV. Quality Gates | PASS | PASS | Will run eslint, tsc, next build, vitest before PR. |
| V. Stack Constraints | PASS | PASS | Uses existing stack only. No new dependencies. |
| Security | PASS | PASS | No new endpoints. Service-role stays server-side. |
| Timezone | PASS | PASS | Service date calculations use `America/Bahia` via existing `todayBahiaDate()`. |

## Project Structure

### Documentation (this feature)

```text
specs/071-tracking-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (files modified)

```text
src/
├── lib/
│   ├── tracking/
│   │   └── process-device-geofence-events.ts  # Issue 3: deferred guard fix
│   └── validators/
│       └── tracking.ts                         # Issue 4B: .max(100) cap
├── app/
│   └── api/
│       ├── tracking/[vanId]/
│       │   └── route.ts                        # Issue 4B: batch .in() query
│       └── routes/[routeId]/start/
│           └── route.ts                        # Issue 2: reprocess on shift start
└── __tests__/
    └── tracking/
        └── process-device-geofence-events.test.ts  # Extended tests
```

**Structure Decision**: No structural changes. All modifications are within existing files following established patterns.

## Implementation Details

### Change 1: Deferred Event Status Update (Issue 3)

**File**: `src/lib/tracking/process-device-geofence-events.ts` ~line 285

Add one line before the `return` in the contiguous-prefix guard:

```typescript
if (matchedIndex > 0) {
  // ... existing warn ...
  await updateEventStatus(supabase, vanId, eventId, "no_match");  // NEW
  return;
}
```

**Why this works**: `updateEventStatus` already exists (line 326), accepts `"no_match"` literal, and is used by 7 other guard paths. The duplicate-detection logic (lines 76-84) resets `no_match` → `received` on resend, preserving retry capability.

### Change 2: Geofence Events Array Cap (Issue 4B)

**File**: `src/lib/validators/tracking.ts` line 23

```typescript
// Before:
geofenceEvents: z.array(geofenceEventSchema).optional(),

// After:
geofenceEvents: z.array(geofenceEventSchema).max(100).optional(),
```

**Why 100**: The batch `points` array already uses `.max(100)` (line 27), establishing the pattern. Normal operations produce 20-50 events; 300+ only occurred due to the retry loop bug.

### Change 3: Batch `.in()` Query (Issue 4B)

**File**: `src/app/api/tracking/[vanId]/route.ts` — `appendGeofenceResponse` function

Replace the single `.in("event_id", submittedEventIds)` query with batched queries of 50:

```typescript
const BATCH_SIZE = 50;
const allConfirmed: typeof confirmedEvents = [];
for (let i = 0; i < submittedEventIds.length; i += BATCH_SIZE) {
  const batch = submittedEventIds.slice(i, i + BATCH_SIZE);
  const { data } = await supabase
    .from("tracking_geofence_events")
    .select("event_id, matched_schedule_entry_id, matched_run_id")
    .eq("van_id", vanId)
    .in("event_id", batch)
    .eq("status", "matched");
  if (data) allConfirmed.push(...data);
}
```

**Why 50**: 50 UUIDs × 36 chars ≈ 2KB, safely under Kong's 4KB header limit. Max 2 queries per request (100 cap / 50 batch).

### Change 4: Reprocess `no_match` Events on Shift Creation (Issue 2)

**File**: `src/app/api/routes/[routeId]/start/route.ts` — after shift insert (~line 128)

```typescript
// Reprocess no_match events that arrived before shift was created
try {
  const dayStart = DateTime.fromISO(serviceDate, { zone: "America/Bahia" }).startOf("day").toISO();
  const dayEnd = DateTime.fromISO(serviceDate, { zone: "America/Bahia" }).endOf("day").toISO();

  const { data: staleEvents } = await supabase
    .from("tracking_geofence_events")
    .select("event_id, place_id, entered_at")
    .eq("van_id", van.id)
    .eq("status", "no_match")
    .gte("entered_at", dayStart)
    .lte("entered_at", dayEnd);

  if (staleEvents && staleEvents.length > 0) {
    await processDeviceGeofenceEvents({
      supabase,
      vanId: van.id,
      geofenceEvents: staleEvents.map((e) => ({
        placeId: e.place_id,
        enteredAt: new Date(e.entered_at).getTime(),
        eventId: e.event_id,
      })),
    });
  }
} catch (error) {
  console.error("Failed to reprocess no_match events after shift creation:", error);
}
```

**Import to add**: `processDeviceGeofenceEvents` from `@/lib/tracking/process-device-geofence-events`.

**Why try/catch**: FR-008 — reprocessing failures must not block shift start. The shift is already persisted at this point.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
