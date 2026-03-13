# Data Model: Tracking Reliability Fixes

**Branch**: `071-tracking-fixes` | **Date**: 2026-03-13

## Schema Changes

**No database migrations required.** All fixes operate within the existing schema.

---

## Affected Entities

### tracking_geofence_events

No schema change. Behavioral change only:

| Field | Type | Change |
|-------|------|--------|
| `status` | `text CHECK (IN 'received', 'matched', 'no_match')` | **No change** — `no_match` already exists in CHECK constraint |

**Status lifecycle update**:

```
Before fix:
  received → [guard fail] → no_match    (7 existing paths)
  received → [deferred]  → received     (BUG: stays received, device retries forever)
  received → [matched]   → matched

After fix:
  received → [guard fail] → no_match    (7 existing paths)
  received → [deferred]  → no_match     (FIX: acknowledged, device stops retrying)
  received → [matched]   → matched
  no_match → [resend]    → received     (existing duplicate-detection resets for retry)
```

### Validation Schema (Zod)

| Field | Current | After |
|-------|---------|-------|
| `geofenceEvents` | `z.array(geofenceEventSchema).optional()` | `z.array(geofenceEventSchema).max(100).optional()` |

Adds upper bound validation. No database constraint change.

---

## Query Patterns

### New Query: Reprocess `no_match` events on shift creation

```
SELECT event_id, place_id, entered_at
FROM tracking_geofence_events
WHERE van_id = :vanId
  AND status = 'no_match'
  AND entered_at >= :serviceDateStart    -- start of day in America/Bahia
  AND entered_at <= :serviceDateEnd      -- end of day in America/Bahia
```

**Index coverage**: Existing `UNIQUE (van_id, event_id)` index covers `van_id` filter. The `status` + `entered_at` filters scan within the van's events only (typically <100 rows per van per day).

### Modified Query: Batch `.in()` in `appendGeofenceResponse`

```
-- Before: single query with all IDs
SELECT ... WHERE event_id IN (:allIds)

-- After: chunked into batches of 50
SELECT ... WHERE event_id IN (:batch1)
SELECT ... WHERE event_id IN (:batch2)
-- Results merged in application code
```

**Performance**: Max 2 queries per request (100 events / 50 per batch). Negligible latency impact.
