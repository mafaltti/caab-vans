# Contract: POST /api/routes/[routeId]/detour

**Type**: New endpoint
**Auth**: Requires `role = "driver"` + active shift ownership

## Purpose

Enter or exit detour mode on a route run. Detour is informational only — it flags the route as deviating without affecting stop progression. Logs an audit event for each toggle.

## Request

```
POST /api/routes/{routeId}/detour
Authorization: Bearer <session cookie>
Content-Type: application/json
```

### Body (Zod schema: DetourBodySchema)

```typescript
{
  action: "start" | "end";
  reasonCode?: string;    // Required if action = "start". One of: "road_closure", "accident", "construction", "flooding", "police_checkpoint", "other"
  note?: string;          // Optional free-text (max 500 chars). Required if reasonCode = "other"
}
```

### Validation Rules

1. `action` must be `"start"` or `"end"`
2. If `action === "start"`:
   - `reasonCode` is required
   - `reasonCode` must be one of the predefined values
   - If `reasonCode === "other"`, `note` is required and non-empty
   - Route must NOT already be in detour mode (409 if already active)
3. If `action === "end"`:
   - `reasonCode` and `note` are ignored
   - Route MUST be in detour mode (409 if not active)
4. `note` max length: 500 characters

## Response (200 OK)

### Start Detour

```typescript
{
  detour: {
    active: true;
    reasonCode: string;
    note: string | null;
    startedAt: string;        // ISO timestamp
    startedBy: string;        // Driver ID
  };
  event: {
    id: string;
    eventType: "detour_started";
    createdAt: string;
  };
}
```

### End Detour

```typescript
{
  detour: {
    active: false;
    endedAt: string;          // ISO timestamp
    endedBy: string;          // Driver ID
  };
  event: {
    id: string;
    eventType: "detour_ended";
    createdAt: string;
  };
}
```

## Side Effects

### Start

1. Update `route_runs`: `is_detour_active = true`, `detour_reason_code`, `detour_note`
2. Insert `route_run_events`: `event_type = 'detour_started'`

### End

1. Update `route_runs`: `is_detour_active = false`, `detour_reason_code = NULL`, `detour_note = NULL`
2. Insert `route_run_events`: `event_type = 'detour_ended'`

### Auto-End on Shift End

When `POST /api/routes/[routeId]/end` is called and `is_detour_active = true`:
1. Auto-deactivate detour (same DB updates as End above)
2. Insert `route_run_events`: `event_type = 'detour_ended'`, `reason_code = 'shift_ended'`

## Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Invalid body |
| 401 | UNAUTHORIZED | Not authenticated |
| 403 | FORBIDDEN | Not driver role |
| 403 | FORBIDDEN | No active shift for this driver on this route today |
| 404 | NOT_FOUND | Route not found |
| 404 | NOT_FOUND | No route run exists for today |
| 409 | CONFLICT | `action = "start"` but detour already active |
| 409 | CONFLICT | `action = "end"` but detour not active |
