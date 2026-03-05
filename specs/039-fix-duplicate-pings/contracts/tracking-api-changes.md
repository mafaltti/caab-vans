# Contract Changes: POST /api/tracking/{vanId}

## Request (unchanged)

```
POST /api/tracking/{vanId}
Headers: x-ingestion-token: {token}
Content-Type: application/json
```

```json
{
  "deviceId": "uuid",
  "lat": -12.971522,
  "lng": -38.511413,
  "accuracy": 7.5,
  "speed": 8.3,
  "heading": 45.2,
  "ts": 1740000000000
}
```

## Response Changes

### Success (new ping) — unchanged

```json
HTTP 200
{ "received": true, "ts": 1740000000000 }
```

### Success (duplicate) — NEW

When `(van_id, device_ts)` already exists, the server acknowledges without inserting or processing:

```json
HTTP 200
{ "received": true, "duplicate": true, "ts": 1740000000000 }
```

### Rejection (stale ping) — NEW

When `device_ts` is older than 24 hours:

```json
HTTP 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Ping too old" } }
```

## Behavioral Changes

| Aspect | Before | After |
|--------|--------|-------|
| Insert method | `.insert()` | `.upsert({ onConflict: "van_id,device_ts", ignoreDuplicates: true })` |
| Duplicate handling | Inserts new row | Silently skips, returns `duplicate: true` |
| isNewest comparison | `>=` (equal passes) | `>` (strict, equal does not pass) |
| Staleness check | None (only future clamp) | Rejects `device_ts` older than 24 hours |
| Downstream trigger | Every insert (including duplicates) | Only when `isNewest` is strictly true |
| inferStopProgress | Called unconditionally | Moved inside `if (isNewest)` block |

## Client Compatibility

The tracker client currently checks only `result.success` (boolean). The new `duplicate: true` field is additive and does not break existing clients. Old tracker versions will still work — duplicates are handled server-side regardless.
