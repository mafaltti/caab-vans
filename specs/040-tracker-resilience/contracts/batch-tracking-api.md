# Contract: Batch Tracking API

**Feature**: 040-tracker-resilience | **Date**: 2026-03-05

## Endpoint

`POST /api/tracking-batch/{vanId}`

## Authentication

Same as existing single-ping endpoint:
- Header: `x-ingestion-token: {token}`
- Token validated against `vans.ingestion_token`

## Request

### Headers

| Header | Value | Required |
|--------|-------|----------|
| Content-Type | application/json | Yes |
| x-ingestion-token | {van ingestion token} | Yes |

### Body

Array of location points (maximum 100 per request):

```json
{
  "points": [
    {
      "deviceId": "uuid",
      "lat": -12.9714,
      "lng": -38.5124,
      "accuracy": 8.5,
      "speed": 12.3,
      "heading": 180.0,
      "ts": 1740000000000,
      "seq": 42,
      "bufferSize": 15,
      "failureCount": 0,
      "batteryLevel": 0.85,
      "networkType": "cellular"
    }
  ]
}
```

### Field Validation (per point)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| deviceId | uuid | Yes | Valid UUID format |
| lat | number | Yes | -90 to 90 |
| lng | number | Yes | -180 to 180 |
| accuracy | number \| null | Yes | >= 0 or null |
| speed | number \| null | Yes | >= 0 or null |
| heading | number \| null | Yes | 0-360 or null |
| ts | integer | Yes | Positive, Unix ms |
| seq | integer \| null | No | Positive or null |
| bufferSize | integer \| null | No | >= 0 or null |
| failureCount | integer \| null | No | >= 0 or null |
| batteryLevel | number \| null | No | 0.0-1.0 or null |
| networkType | string \| null | No | wifi, cellular, none, or null |

### Array Constraints

- Minimum: 1 point
- Maximum: 100 points
- Points should be ordered chronologically (oldest first) but server does not enforce ordering

## Response

### Success (200)

```json
{
  "received": 50,
  "duplicates": 3,
  "ts": 1740000060000
}
```

| Field | Type | Description |
|-------|------|-------------|
| received | integer | Total points processed |
| duplicates | integer | Points skipped due to dedup (van_id, device_ts unique) |
| ts | integer | Server timestamp (Unix ms) |

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid payload or individual point validation failure |
| 401 | UNAUTHORIZED | Missing or invalid ingestion token |
| 404 | NOT_FOUND | Van ID not found |
| 429 | RATE_LIMITED | Rate limit exceeded (counted as 1 request, not N) |
| 500 | INTERNAL_ERROR | Server error |

### Rate Limiting

The batch request counts as **1 request** against the rate limit (25 req/min per van), regardless of how many points it contains.

## Server Processing

1. Validate token and van existence
2. Parse and validate all points against schema
3. For each point (in chronological order):
   a. Apply timestamp clamping (future cap: +5 min)
   b. Apply staleness guard (reject > 24h old)
   c. Upsert into `van_location_pings` (dedup via unique index)
4. Identify the newest valid point
5. For newest point only:
   a. Update `vans` table (last_lat, last_lng, etc.)
   b. Run OSRM snap-to-road (if configured)
   c. Run `inferStopProgress` for geofence detection
6. Return summary response

## Backward Compatibility

- Existing single-point endpoint (`POST /api/tracking/{vanId}`) remains unchanged
- Single-point endpoint also accepts new optional fields (seq, bufferSize, etc.)
- Both endpoints must be deployed simultaneously (hard requirement per spec)

## Changes to Existing Endpoint

The existing `POST /api/tracking/{vanId}` endpoint schema is extended with optional fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| seq | integer \| null | No | New - sequence number |
| bufferSize | integer \| null | No | New - health metadata |
| failureCount | integer \| null | No | New |
| batteryLevel | number \| null | No | New |
| networkType | string \| null | No | New |

These fields are passed through to `van_location_pings` new columns. Existing clients that don't send them get null values.
