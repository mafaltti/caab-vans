# API Contract: Tracking Endpoint

**Date**: 2026-03-05 | **Branch**: `040-tracker-resilience`

This is the HTTP contract between the Expo tracker app (client) and the CAAB Vans backend (server).

## Single-Ping Endpoint

`POST {API_BASE_URL}/api/tracking/{vanId}`

### URL Parameters

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `vanId`   | UUID   | ID of the van being tracked |

### Headers

| Header              | Value                  | Required |
|---------------------|------------------------|----------|
| `Content-Type`      | `application/json`     | Yes      |
| `x-ingestion-token` | `<van ingestion token>`| Yes      |

### Body

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "lat": -12.9714,
  "lng": -38.5124,
  "accuracy": 8.5,
  "speed": 12.3,
  "heading": 180.0,
  "ts": 1717012345678,
  "seq": 42,
  "bufferSize": 5,
  "failureCount": 0,
  "batteryLevel": 0.85,
  "networkType": "cellular"
}
```

| Field          | Type             | Required | Constraints                |
|----------------|------------------|----------|----------------------------|
| `deviceId`     | `string` (UUID)  | Yes      | Valid UUID v4              |
| `lat`          | `number`         | Yes      | -90 to 90                 |
| `lng`          | `number`         | Yes      | -180 to 180               |
| `accuracy`     | `number \| null` | Yes      | >= 0 or null               |
| `speed`        | `number \| null` | Yes      | >= 0 or null               |
| `heading`      | `number \| null` | Yes      | 0 to 360 or null           |
| `ts`           | `number`         | Yes      | Positive integer, Unix ms  |
| `seq`          | `number \| null` | No       | Positive integer or null   |
| `bufferSize`   | `number \| null` | No       | >= 0 or null               |
| `failureCount` | `number \| null` | No       | >= 0 or null               |
| `batteryLevel` | `number \| null` | No       | 0.0-1.0 or null            |
| `networkType`  | `string \| null` | No       | wifi, cellular, none, null |

### Response — 200 OK

```json
{
  "received": true,
  "ts": 1717012345700
}
```

---

## Batch Endpoint

`POST {API_BASE_URL}/api/tracking-batch/{vanId}`

### Headers

Same as single-ping endpoint.

### Body

```json
{
  "points": [
    {
      "deviceId": "550e8400-e29b-41d4-a716-446655440000",
      "lat": -12.9714,
      "lng": -38.5124,
      "accuracy": 8.5,
      "speed": 12.3,
      "heading": 180.0,
      "ts": 1717012345678,
      "seq": 42,
      "bufferSize": 5,
      "failureCount": 0,
      "batteryLevel": 0.85,
      "networkType": "cellular"
    }
  ]
}
```

- Array of 1-100 points, each with the same fields as single-ping
- Points should be ordered chronologically (oldest first)

### Response — 200 OK

```json
{
  "received": 50,
  "duplicates": 3,
  "ts": 1717012345700
}
```

| Field        | Type      | Description                              |
|--------------|-----------|------------------------------------------|
| `received`   | `number`  | Total points processed                   |
| `duplicates` | `number`  | Points skipped (dedup by van_id+device_ts)|
| `ts`         | `number`  | Server timestamp (Unix ms)               |

### Rate Limiting

The batch request counts as **1 request** against the rate limit (40 req/min per van).

---

## Error Responses (Both Endpoints)

### 400 Bad Request — Validation Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "lat must be a number"
  }
}
```

**Client behavior**: Log error, do NOT buffer the point (it's malformed).

### 401 Unauthorized — Bad or Missing Token

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid ingestion token"
  }
}
```

**Client behavior**: After 3 consecutive 401s, pause sending and show alert directing driver to Settings.

### 404 Not Found — Van Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Van not found"
  }
}
```

**Client behavior**: Display error on Home screen. Driver should verify Van ID in Settings.

### 429 Too Many Requests — Rate Limited

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

**Client behavior**: Skip this point. Do NOT buffer — the server already has recent data.

## Rate Limit

- **Server limit**: 40 requests/minute per van
- **Client send rate**: ~1 request per 3-5 seconds
- **Batch flush**: Counts as 1 request regardless of point count

## Network Error Handling

When the HTTP request fails due to network error (no response):
- Buffer the point in the offline queue (up to 100 points, ring buffer eviction)
- Apply exponential backoff (5s, 10s, 30s, 60s, 2min, 5min cap)
- Points older than 24h are pruned before flush
- Batch flush sends all buffered points in a single request
