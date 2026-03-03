# Contract: OSRM Match API (Internal Dependency)

**Feature**: 033-road-snapping
**Type**: Internal service dependency (self-hosted OSRM)
**Direction**: Next.js BFF → OSRM container

## Overview

The tracking ingestion API calls OSRM's Map Matching service to snap GPS coordinates to the road network. This is a server-side internal call — never exposed to clients.

## Request

**Method**: `GET`
**URL**: `{OSRM_BASE_URL}/match/v1/driving/{coordinates}?{params}`

### URL Path

| Segment | Value | Description |
|---------|-------|-------------|
| service | `match` | Map matching service |
| version | `v1` | API version |
| profile | `driving` | Vehicle routing profile (car/van) |
| coordinates | `{lng1},{lat1};{lng2},{lat2};...` | Semicolon-separated coordinate pairs (lng,lat order) |

### Query Parameters

| Parameter | Required | Example | Description |
|-----------|----------|---------|-------------|
| `timestamps` | Yes | `1709500000;1709500015;...` | Unix timestamps (seconds) per coordinate, semicolon-separated |
| `radiuses` | No | `10;8;12;...` | GPS accuracy (meters) per coordinate. Tells OSRM how much to trust each point |
| `geometries` | No | `geojson` | Response geometry format. Use `geojson` for standard parsing |
| `overview` | No | `false` | Skip full route geometry (not needed, we only want tracepoints) |
| `annotations` | No | `false` | Skip per-segment metadata (not needed) |

### Example Request

```
GET /match/v1/driving/-38.481,-12.965;-38.482,-12.966;-38.483,-12.967;-38.484,-12.968;-38.485,-12.969?timestamps=1709500000;1709500015;1709500030;1709500045;1709500060&radiuses=10;8;12;10;9&geometries=geojson&overview=false&annotations=false
```

## Response

### Success (HTTP 200)

```json
{
  "code": "Ok",
  "tracepoints": [
    {
      "matchings_index": 0,
      "waypoint_index": 0,
      "alternatives_count": 0,
      "location": [-38.4812, -12.9648],
      "name": "Rua Example",
      "hint": "..."
    },
    {
      "matchings_index": 0,
      "waypoint_index": 1,
      "alternatives_count": 0,
      "location": [-38.4823, -12.9661],
      "name": "Rua Example",
      "hint": "..."
    },
    null,
    {
      "matchings_index": 0,
      "waypoint_index": 2,
      "location": [-38.4841, -12.9679],
      "name": "Avenida Example",
      "hint": "..."
    },
    {
      "matchings_index": 0,
      "waypoint_index": 3,
      "location": [-38.4852, -12.9688],
      "name": "Avenida Example",
      "hint": "..."
    }
  ],
  "matchings": [
    {
      "confidence": 0.85,
      "geometry": { "type": "LineString", "coordinates": [...] },
      "legs": [...]
    }
  ]
}
```

### Key Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | `"Ok"` on success, `"NoMatch"` if no road match found |
| `tracepoints` | array | One entry per input coordinate. Contains snapped `location` or `null` if unmatched |
| `tracepoints[i].location` | `[lng, lat]` | **Snapped coordinate** (longitude, latitude order) |
| `matchings[i].confidence` | number (0-1) | Confidence of the overall match |

### Error Responses

| Code | HTTP Status | Meaning | Action |
|------|-------------|---------|--------|
| `"Ok"` | 200 | Success | Extract tracepoint for latest ping |
| `"NoMatch"` | 200 | No road match found | Fall back to raw GPS |
| `"InvalidUrl"` | 400 | Malformed request | Log error, fall back to raw GPS |
| Connection refused | N/A | OSRM container down | Fall back to raw GPS |
| Timeout (>50ms) | N/A | OSRM slow/overloaded | Fall back to raw GPS |

## Integration Logic

### Extracting the Snapped Coordinate

```
Input: 5 coordinates [ping_t-4, ping_t-3, ping_t-2, ping_t-1, ping_t-0 (current)]
Output: tracepoints[4].location → [snapped_lng, snapped_lat] for the current ping

If tracepoints[4] is null → no match for current ping → fall back to raw GPS
If code is "NoMatch" → no match for entire trajectory → fall back to raw GPS
```

### Timeout & Retry Policy

- **Timeout**: 50ms (enforces FR-011 latency constraint — raw GPS is acceptable fallback)
- **Retries**: 0 (no retries — next ping arrives in ~15 seconds anyway)
- **Circuit breaker**: Not needed at current scale (4 vans, ~4 pings/min each)

## Environment Configuration

| Variable | Dev Value | Production Value |
|----------|-----------|-----------------|
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | `http://localhost:5000` |
