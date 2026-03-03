# Tracking Feature Coverage — 016 + 017 + 018

> So that's everything I need? If I complete these three features I will have everything setup?

**Almost.** The three features cover deliverables A through I from the spec. Here's what's not included:

## Covered by 016 + 017 + 018

- **A)** Database migration
- **B)** Ingestion endpoint
- **C)** Stop inference V1
- **D)** ETA computation
- **E)** Public API extension
- **F)** Admin UI (stop coordinates)
- **G)** Public UI (ETA, passed stops)
- **H)** Expo app
- **I)** Unit tests

## Not Covered — Needs Follow-up

| Gap | What | Effort |
|-----|------|--------|
| **J) Documentation** | `docs/TRACKING.md` — driver auth, stop config guide, operational expectations | Small, 1 PR |
| **Data retention cron** | Daily `DELETE FROM van_location_pings WHERE received_at < now() - '30 days'` — `pg_cron` or external job | Small, infra task |
| **Embedded map component** | The Leaflet/OSM map that shows van position on hero-card. The spec explicitly says "separate frontend spec." 017 adds a "Ver no mapa" link but not the actual map. | Separate feature (019?) |
| **Stop coordinate data** | Someone needs to actually enter lat/lng for each stop via the admin panel (017 builds the UI, but the data is operational) | Manual/operational |

## Bottom Line

After 016 + 017 + 018, you'll have a working end-to-end tracking pipeline: the Expo app sends pings, the backend stores and infers stop progress, and the public UI shows ETA and passed stops. The embedded map and docs are follow-ups that don't block the core system from working.
