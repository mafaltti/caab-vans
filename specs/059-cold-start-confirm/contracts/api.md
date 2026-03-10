# API Contracts: Cold-Start Stop Confirmation

**Date**: 2026-03-10 | **Branch**: `059-cold-start-confirm`

## 1. POST /api/routes/{routeId}/start (Modified)

### Request

**Body** (new — previously no body):
```json
{
  "lat": -12.9714,
  "lng": -38.5124
}
```
- `lat` and `lng` are optional. Omitting them triggers the GPS fallback chain.

### Response (when cold-start detected)

```json
{
  "shift": {
    "id": "uuid",
    "runId": "uuid",
    "driverId": "uuid",
    "startedAt": "2026-03-10T08:20:00-03:00",
    "endedAt": null
  },
  "run": {
    "id": "uuid",
    "routeId": "uuid",
    "serviceDate": "2026-03-10"
  },
  "coldStart": {
    "suggestedStop": {
      "id": "schedule-entry-uuid",
      "name": "Comércio (Antigo TRT-5)",
      "time": "08:20"
    },
    "alternatives": [
      { "id": "uuid", "name": "Fórum Ruy Barbosa", "time": "08:35" },
      { "id": "uuid", "name": "CAAB", "time": "06:10" }
    ]
  }
}
```

- `coldStart` is omitted entirely when conditions are not met (on-time start, resumed shift, no coordinates).
- `coldStart.suggestedStop` is `null` when no GPS is available (time-only fallback). In this case, `alternatives` contains up to 5 stops.
- `coldStart.alternatives` contains up to 4 stops when a suggestion exists.

### Response (no cold-start — unchanged)

```json
{
  "shift": { "id": "...", "runId": "...", "driverId": "...", "startedAt": "...", "endedAt": null },
  "run": { "id": "...", "routeId": "...", "serviceDate": "..." }
}
```

### Errors (unchanged)

| Status | Code | When |
|--------|------|------|
| 403 | FORBIDDEN | Not a driver or not assigned to van |
| 404 | NOT_FOUND | Route not found |
| 409 | CONFLICT | Active shift already exists |
| 422 | VALIDATION_ERROR | Route has no schedule entries |

---

## 2. POST /api/routes/{routeId}/confirm-start-stop (New)

### Request

```json
{
  "stopId": "schedule-entry-uuid"
}
```

- `stopId` is required. Must be a valid `schedule_entry.id` belonging to this route.

### Response (200 — success)

```json
{
  "confirmed": true,
  "nextStopId": "schedule-entry-uuid",
  "lastPassedStopId": "schedule-entry-uuid-or-null",
  "passedCount": 5
}
```

### Response (200 — idempotent retry)

Same shape as success. `confirmed: true`, values match prior confirmation.

### Errors

| Status | Code | When |
|--------|------|------|
| 400 | BAD_REQUEST | `stopId` missing or not a schedule entry of this route |
| 403 | FORBIDDEN | Not a driver, no active shift, or not shift owner |
| 409 | CONFLICT | Run already has passed stops (geofence or prior confirm with different stop) |

---

## 3. Zod Schemas

### StartShiftBodySchema

```typescript
const StartShiftBodySchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(
  (d) => (d.lat == null) === (d.lng == null),
  { message: "lat and lng must both be provided or both omitted" }
);
```

### ConfirmStartStopBodySchema

```typescript
const ConfirmStartStopBodySchema = z.object({
  stopId: z.string().uuid(),
});
```
