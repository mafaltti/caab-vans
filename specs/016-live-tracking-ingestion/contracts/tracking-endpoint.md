# Contract: POST /api/tracking/[vanId]

## Overview

Accepts GPS location pings from the Expo tracker app. Stores ping history and updates the van's latest known position.

## Request

**Method**: POST
**Path**: `/api/tracking/{vanId}`
**Content-Type**: `application/json`

### Headers

| Header             | Required | Description                      |
|--------------------|----------|----------------------------------|
| `x-ingestion-token`| Yes     | Van's ingestion token from DB    |
| `Content-Type`     | Yes      | Must be `application/json`       |

### Path Parameters

| Parameter | Type   | Description         |
|-----------|--------|---------------------|
| `vanId`   | UUID   | Target van's ID     |

### Body

| Field      | Type            | Required | Constraints               | Description                    |
|------------|-----------------|----------|---------------------------|--------------------------------|
| `deviceId` | string (UUID)   | Yes      | Valid UUID                 | Device identifier (diagnostic) |
| `lat`      | number          | Yes      | -90 to 90                 | Latitude, WGS84               |
| `lng`      | number          | Yes      | -180 to 180               | Longitude, WGS84              |
| `accuracy` | number \| null  | Yes      | >= 0 if not null           | Horizontal accuracy (meters)   |
| `speed`    | number \| null  | Yes      | >= 0 if not null           | Speed (m/s)                    |
| `heading`  | number \| null  | Yes      | 0 to 360 if not null       | Heading (degrees)              |
| `ts`       | number          | Yes      | Positive integer           | Unix milliseconds, UTC         |

### Example

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "lat": -12.9714,
  "lng": -38.5124,
  "accuracy": 8.5,
  "speed": 12.3,
  "heading": 180.0,
  "ts": 1717012345678
}
```

## Responses

### 200 — Ping Accepted

```json
{
  "received": true,
  "ts": 1717012345999
}
```

| Field      | Type   | Description              |
|------------|--------|--------------------------|
| `received` | boolean| Always `true`            |
| `ts`       | number | Server Unix milliseconds |

### 400 — Validation Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "lat: Number must be between -90 and 90"
  }
}
```

### 401 — Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid ingestion token"
  }
}
```

### 404 — Van Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Van not found"
  }
}
```

### 429 — Rate Limited

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

## Rate Limiting

- **Window**: 60 seconds
- **Max requests**: 25 per van
- **Key**: `vanId` (path parameter)

## Timestamp Handling

- `ts` is converted from Unix milliseconds to timestamptz for storage.
- If `ts` is more than 24 hours in the future relative to server time, it is capped to `now()`.
- Past timestamps are accepted as-is (supports offline buffer flush).

## Side Effects

On successful ping:
1. New row inserted into `van_location_pings`.
2. Van record updated: `last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg`, `location_updated_at = now()`.
