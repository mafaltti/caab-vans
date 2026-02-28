# API Contract Changes: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28

## Summary

One additive change to an existing BFF endpoint. No breaking changes. No new endpoints.

---

## GET /api/routes — Routes List

### Change Type: Additive (non-breaking)

**New fields** added to each route object in the `routes` array:

```jsonc
{
  "routes": [
    {
      // ... existing fields unchanged ...
      "id": "uuid",
      "name": "Rota Van 1",
      "isRunning": true,
      "nextStop": { "stopName": "Fórum Ruy Barbosa", "time": "11:15" },
      "scheduleStatus": "active",
      "van": { /* unchanged */ },

      // NEW FIELDS
      "totalStops": 24,          // total schedule entries
      "currentStopIndex": 7      // 0-based index of next stop (null if ended)
    }
  ],
  "serverTime": "14:30"
}
```

### Behavior Notes
- `totalStops`: Always >= 0. Returns 0 if route has no schedule entries.
- `currentStopIndex`: Returns `null` when `scheduleStatus` is `"ended"` or `nextStop` is `null`. Otherwise returns 0-based index.
- Progress display: "Parada {currentStopIndex + 1} de {totalStops}"

---

## GET /api/routes/[routeId] — Route Detail

### Change Type: None

No changes. The existing response already provides all data needed for the timeline:
- `route.schedule[]` — full list of stops with `id`, `stopName`, `time`
- `route.nextStop` — current/next stop reference
- Timeline stop status (`past`/`current`/`future`) is derived client-side

---

## GET /api/announcements — Announcements List

### Change Type: None

No changes. The existing response already provides all data needed:
- `isUrgent` boolean maps to "URGENTE" / "INFORMATIVO" badge
- `isPinned` boolean drives pin indicator
- Notification dot logic: `announcements.some(a => a.isUrgent)` (client-side)

---

## URL Route Changes

| Old URL            | New URL    | Redirect |
|--------------------|------------|----------|
| `/announcements`   | `/avisos`  | 301 permanent redirect from old to new |

The redirect ensures existing bookmarks/links continue working.
