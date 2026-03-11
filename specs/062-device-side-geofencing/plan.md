# Implementation Plan: Device-Side Geofencing

**Branch**: `062-device-side-geofencing` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/062-device-side-geofencing/spec.md`
**Analysis**: `docs/execution/0106-device-side-geofencing-complete-analysis.md`

## Summary

Stop detection is 100% server-side today and fails whenever GPS pings stop arriving (OS kills foreground service, network loss, rate-limit cascades). This feature adds device-side OS-level geofencing as a complementary detection source. The tracker registers Android's GeofencingClient to monitor 5-9 physical stop locations per van. When the van enters a stop's 150m radius, the OS fires a callback regardless of whether the GPS service is active. Events are buffered locally and piggybacked on the next GPS ping. The server processes events via a dedicated helper with idempotent ledger, tiered confidence scoring, and post-healing acknowledgment. Existing GPS-based inference remains as an unchanged fallback.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 + Expo SDK 55 / React Native 0.83.2)
**Primary Dependencies**: Next.js (App Router), Supabase JS, expo-location ~55.1.2, expo-task-manager ~55.0.9, Zod, Luxon
**Storage**: PostgreSQL (via Supabase self-hosted Docker)
**Testing**: Vitest (server), manual + EAS build (tracker)
**Target Platform**: Linux VPS (server) + Android (tracker)
**Project Type**: Web service (BFF) + Mobile app (tracker)
**Performance Goals**: Event processing adds ~1 DB query per event inline with existing ping pipeline (<200ms p95)
**Constraints**: No new permissions, no new native dependencies, existing SDK capabilities only
**Scale/Scope**: 4 vans, 5-9 geofence regions per van, ~80 events/day, 154 schedule entries total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --------- | ------ | -------- |
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Dedicated helper (not bolted onto 454-line inferStopProgress). Events piggyback on existing pings (no extra API calls). Fallback is zero-cost (existing code stays). Gap-1 backfill is the simplest approach that works. |
| II. Explicit Trade-offs | PASS | Trade-offs documented: two code paths vs unified (simpler testing), 150m vs 50m radius (physical constraints), conservative backfill gap-1 vs gap-3 (false positive risk). |
| III. Branch & Merge | PASS | Feature branch `062-device-side-geofencing`, PR targets `dev`. |
| IV. Quality Gates | PASS | lint, typecheck, build, tests required. Server tests with Vitest. |
| V. Stack Constraints | PASS | Uses existing stack: Next.js Route Handlers, Zod, Luxon, Supabase, Expo. No Edge Functions. |
| Security | PASS | Uses existing `x-ingestion-token` auth. No new public keys. Service-role key server-only. |
| Timezone | PASS | eventTs uses Luxon with America/Bahia (existing pattern). configVersion is UTC ISO timestamp. |

**Post-design re-check**: All gates still pass. No new abstractions beyond what's needed. The dedicated helper has clear single responsibility. The new table has a concrete, immediate purpose (idempotency + audit).

## Project Structure

### Documentation (this feature)

```text
specs/062-device-side-geofencing/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — resolved decisions and rationale
├── data-model.md        # Phase 1 — entity definitions and state transitions
├── quickstart.md        # Phase 1 — developer setup guide
├── contracts/
│   ├── tracker-config-api.md       # New GET endpoint contract
│   └── tracking-ping-extension.md  # Extended POST endpoint contract
└── checklists/
    └── requirements.md  # Spec quality validation
```

### Source Code (repository root)

```text
# Server (Next.js BFF)
src/
├── app/api/
│   ├── tracker-config/[vanId]/route.ts           # NEW — config endpoint
│   └── tracking/[vanId]/route.ts                 # MODIFIED — geofence event processing
├── lib/
│   ├── tracking/
│   │   └── process-device-geofence-events.ts     # NEW — dedicated event helper
│   └── validators/
│       └── tracking.ts                           # MODIFIED — geofenceEvents schema
└── types/
    └── index.ts                                  # MODIFIED — PassSource type

# Database
supabase/migrations/
└── 00015_device_side_geofencing.sql              # NEW — migration

# Tracker App (Expo/React Native)
apps/van-tracker/src/
├── api/
│   ├── client.ts                                 # MODIFIED — event piggyback + ack
│   └── config.ts                                 # NEW — config fetch module
├── location/
│   ├── geofence-task.ts                          # NEW — geofence task definition
│   └── tracking.ts                               # MODIFIED — geofence lifecycle
├── storage/
│   └── tracking-state.ts                         # MODIFIED — new AsyncStorage keys
└── types.ts                                      # MODIFIED — GeofenceEvent types

# Tests
src/__tests__/
├── process-device-geofence-events.test.ts        # NEW
└── tracker-config.test.ts                        # NEW
```

**Structure Decision**: Follows existing project layout exactly. Server code in `src/app/api/` and `src/lib/tracking/`. Tracker code in `apps/van-tracker/src/`. New files follow the same directory conventions as existing code. No new directories or structural changes needed.

## Implementation Phases

### Phase 1: Server Foundation

**Goal**: All server-side infrastructure ready. Existing tracker versions continue working unchanged.

| Step | File | Change | ~Lines | Depends on |
| ---- | ---- | ------ | ------ | ---------- |
| 1.1 | `supabase/migrations/00015_device_side_geofencing.sql` | Add `device_geofence` to pass_source CHECK, add `device_geofence_radius_m` + `updated_at` to schedule_entries, create `tracking_geofence_events` table | 35 | — |
| 1.2 | `src/types/index.ts` | Add `"device_geofence"` to `PassSource` union | 1 | 1.1 |
| 1.3 | `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` | Add `"device_geofence"` to geofence guard check | 2 | 1.2 |
| 1.4 | `src/app/api/tracker-config/[vanId]/route.ts` | New endpoint: auth, route lookup, dedup regions, return config + version | 60 | 1.1 |
| 1.5 | `src/lib/validators/tracking.ts` | Add optional `geofenceEvents` array to Zod schema | 15 | — |
| 1.6 | `src/lib/tracking/process-device-geofence-events.ts` | New helper: upsert events to ledger, resolve placeId → stops, tiered confidence, gap-1 backfill, return tentativeMatchIds | 90 | 1.1, 1.2 |
| 1.7 | `src/app/api/tracking/[vanId]/route.ts` | Wire helper before ping dedup; conditional early return for duplicate+events; compute processedEventIds post-healing; add configVersion to response | 50 | 1.5, 1.6 |
| 1.8 | `src/__tests__/process-device-geofence-events.test.ts` | Test: new events, duplicates, re-processing healed events, confidence scoring, backfill, repeated places | 80 | 1.6 |
| 1.9 | `src/__tests__/tracker-config.test.ts` | Test: auth, region dedup, configVersion, empty regions | 40 | 1.4 |

**Phase 1 subtotal**: ~373 lines (253 production + 120 tests)

### Phase 2: Tracker Implementation

**Goal**: Tracker app detects geofence events and delivers them to server.

| Step | File | Change | ~Lines | Depends on |
| ---- | ---- | ------ | ------ | ---------- |
| 2.1 | `apps/van-tracker/src/types.ts` | Add GeofenceRegion, GeofenceEvent, TrackerConfig types | 15 | — |
| 2.2 | `apps/van-tracker/src/storage/tracking-state.ts` | Add getGeofenceRegions/setGeofenceRegions, getGeofenceConfigVersion/set, getGeofenceEventBuffer/addGeofenceEvent/removeGeofenceEvents | 40 | 2.1 |
| 2.3 | `apps/van-tracker/src/api/config.ts` | New module: fetch GET /api/tracker-config/{vanId}, cache regions + version | 30 | 2.1 |
| 2.4 | `apps/van-tracker/src/location/geofence-task.ts` | New TaskManager.defineTask for geofence enter events; dedup by placeId+60s window; buffer to AsyncStorage | 45 | 2.2 |
| 2.5 | `apps/van-tracker/src/location/tracking.ts` | Add geofence lifecycle: register on start (fetch config → startGeofencingAsync), unregister on stop, boot recovery from cached regions | 35 | 2.3, 2.4 |
| 2.6 | `apps/van-tracker/src/api/client.ts` | Drain geofence event buffer into ping body; parse processedEventIds from response for selective buffer clearing; parse configVersion for resync; trigger config re-fetch on version mismatch | 55 | 2.2, 2.3 |

**Phase 2 subtotal**: ~220 lines

### Phase 3: Integration & Validation

| Step | Action | Depends on |
| ---- | ------ | ---------- |
| 3.1 | EAS build for testing | Phase 2 |
| 3.2 | Deploy server changes to DEV | Phase 1 |
| 3.3 | Field test with one van | 3.1, 3.2 |
| 3.4 | Monitor: device events arriving, stops marked, fallback working | 3.3 |
| 3.5 | Roll out to all vans | 3.4 |

### Total Effort

| Component | Production lines | Test lines | Total |
| --------- | --------------- | ---------- | ----- |
| Server | ~253 | ~120 | ~373 |
| Tracker | ~220 | — | ~220 |
| **Total** | **~473** | **~120** | **~593** |

## Risk Mitigations

| Risk | Mitigation | Ref |
| ---- | ---------- | --- |
| Confidence overwrite | Server inference skips stops already passed with equal/higher confidence | FR-016, R1 |
| Canonical healing reverts device events | Gap-1 backfill + device retry; no healing exemption | FR-006, R4 |
| Aggressive backfill | Device: gap ≤ 1 only. Server: gap ≤ 3 unchanged | FR-009, R3 |
| Duplicate OS enter events | Device dedup by placeId + 60s window | FR-014 |
| Config staleness | configVersion in every ping response, resync on mismatch | FR-011, R5 |
| Duplicate ping drops events | Events processed BEFORE ping dedup; conditional early return | FR-003, R7 |
| Retries stuck as no-ops | Check existing ledger row state; re-process healed events | FR-007, R3 |

## Rollback Plan

1. **Tracker**: Push new EAS build without geofence task. Old builds continue sending pings without `geofenceEvents[]`.
2. **Server**: `geofenceEvents` field is optional. If absent, server runs existing inference only. No code removal needed.
3. **Per-van**: Return empty `geofenceRegions[]` from config endpoint to disable geofencing for specific vans.

The existing server-side pipeline is never removed, only demoted. Rollback is inherently safe.
