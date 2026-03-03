# Contract: Route Detail API — Schedule Extension

## Endpoint

`GET /api/routes/{routeId}`

## Change Type

Additive (non-breaking). Two new nullable fields added to each item in the `schedule` array.

## Current Response Shape (schedule item)

```json
{
  "id": "uuid",
  "stopName": "TRT-5 (Paralela)",
  "time": "08:00"
}
```

## New Response Shape (schedule item)

```json
{
  "id": "uuid",
  "stopName": "TRT-5 (Paralela)",
  "time": "08:00",
  "stopLat": -12.9390,
  "stopLng": -38.4351
}
```

## Field Definitions

| Field   | Type           | Description                          |
|---------|----------------|--------------------------------------|
| stopLat | number \| null | Stop latitude (WGS84). Null if not set. |
| stopLng | number \| null | Stop longitude (WGS84). Null if not set. |

## Notes

- Values come from `schedule_entries.stop_lat` and `schedule_entries.stop_lng` columns (already queried, just not mapped to response).
- No new database queries or migrations required.
- Existing consumers are unaffected — new fields are additive.
