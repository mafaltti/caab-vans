# Data Model: Tracker Flush Resilience

**Date**: 2026-03-13

## No schema changes

This feature modifies runtime behavior only. No database tables, API contracts, or persistent data structures are added or changed.

## In-Memory State (new)

### Flush guard

| Variable | Type | Scope | Lifetime |
|----------|------|-------|----------|
| `isFlushing` | `boolean` | Module-level in `task.ts` | Process lifetime (resets on cold start) |

### Geofence boot grace

| Variable | Type | Scope | Lifetime |
|----------|------|-------|----------|
| `bootTimestamp` | `number` (epoch ms) | Module-level in `geofence-task.ts` | Process lifetime |
| `BOOT_GRACE_MS` | `number` (constant) | Module-level in `geofence-task.ts` | Static |
| `recentEnters` | `Map<string, number>` | Module-level in `geofence-task.ts` | Process lifetime |

## Existing Persisted State (unchanged, already in AsyncStorage)

| Key | Type | Used by |
|-----|------|---------|
| `@consecutiveFailures` | `string` (number) | Backoff — already persisted and hydrated |
| `@backoffUntil` | `string` (number, epoch ms) | Backoff — already persisted and hydrated |
| `@locationBuffer` | `string` (JSON array) | Buffer — unchanged |
| `@geofenceEventBuffer` | `string` (JSON array) | Geofence events — unchanged |

No new AsyncStorage keys are introduced.
