# API Contract: Schedule Time Format

## Change Summary

All API endpoints that return schedule entry `time` fields will return `HH:MM` format (e.g., `"14:30"`) instead of `HH:MM:SS` (e.g., `"14:30:00"`).

## Affected Endpoints

### Public Endpoints

**GET /api/routes**
- `routes[].nextStop.time`: `"HH:MM"` (was `"HH:MM:SS"`)

**GET /api/routes/[routeId]**
- `route.nextStop.time`: `"HH:MM"` (was `"HH:MM:SS"`)
- `route.schedule[].time`: `"HH:MM"` (was `"HH:MM:SS"`)

### Admin Endpoints (no behavioral change — already returning HH:MM via .slice)

**GET /api/admin/routes/[routeId]/schedule**
- `entries[].time`: `"HH:MM"` (unchanged output, implementation changes from `.slice(0,5)` to `formatTimeString`)

**POST /api/admin/routes/[routeId]/schedule**
- `entry.time`: `"HH:MM"` (unchanged output, implementation change only)

**PUT /api/admin/routes/[routeId]/schedule/[entryId]**
- `entry.time`: `"HH:MM"` (unchanged output, implementation change only)

## Input Format (unchanged)

Schedule entry creation and update accept `time` in `HH:MM` format, validated by Zod schema with regex `/^([01]\d|2[0-3]):[0-5]\d$/`. No change required.

## Breaking Change Assessment

**Admin endpoints**: No breaking change — output format is identical before and after.

**Public endpoints**: Format change from `"HH:MM:SS"` to `"HH:MM"`. The frontend components already render this field as-is, so the change is transparent. No external consumers exist (MVP, single client).
