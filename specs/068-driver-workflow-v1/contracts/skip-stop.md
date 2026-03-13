# Contract: POST /api/routes/[routeId]/skip-stop

**Type**: New endpoint
**Auth**: Requires `role = "driver"` + active shift ownership

## Purpose

Skip the current next stop with a required reason code. Marks the stop as "skipped", logs an audit event, advances the next-stop pointer, and returns updated progress.

## Request

```
POST /api/routes/{routeId}/skip-stop
Authorization: Bearer <session cookie>
Content-Type: application/json
```

### Body (Zod schema: SkipStopBodySchema)

```typescript
{
  stopId: string;         // UUID — must match current next_stop_id
  reasonCode: string;     // One of: "road_closure", "no_passengers", "facility_closed", "vehicle_issue", "other"
  note?: string;          // Optional free-text (max 500 chars). Required if reasonCode = "other"
}
```

### Validation Rules

1. `stopId` must be a valid UUID
2. `stopId` must equal the route run's current `next_stop_id` (head-of-line enforcement)
3. `reasonCode` must be one of the predefined values
4. If `reasonCode === "other"`, `note` is required and must be non-empty
5. `note` max length: 500 characters

## Response (200 OK)

```typescript
{
  skipped: true;
  stop: {
    scheduleEntryId: string;
    stopName: string;
    status: "skipped";
    reasonCode: string;
    note: string | null;
    actedBy: string;
    actedAt: string;            // ISO timestamp
  };
  progress: {
    nextStopId: string | null;  // Updated pointer (next pending stop, or null if all resolved)
    lastPassedStopId: string | null;
    hasSkippedStops: true;
  };
  event: {
    id: string;                 // Audit event ID
    eventType: "stop_skipped";
    createdAt: string;
  };
}
```

## Side Effects

1. Update `route_run_stops` row: `status = 'skipped'`, `reason_code`, `note`, `acted_by`, `acted_at`
2. Insert `route_run_events` row: `event_type = 'stop_skipped'`
3. Set `route_runs.has_skipped_stops = true`
4. Call `persistCanonicalProgress()` to update `next_stop_id` and `last_passed_stop_id`

## Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Invalid body (bad UUID, missing reasonCode, note too long) |
| 401 | UNAUTHORIZED | Not authenticated |
| 403 | FORBIDDEN | Not driver role |
| 403 | FORBIDDEN | No active shift for this driver on this route today |
| 404 | NOT_FOUND | Route not found |
| 404 | NOT_FOUND | No route run exists for today |
| 409 | CONFLICT | `stopId` does not match current `next_stop_id` (not head-of-line) |
| 409 | CONFLICT | Stop is already skipped or passed (not pending) |

## Idempotency

If the stop is already `skipped` with the same `acted_by`, return 200 with the existing data (no duplicate event created).
