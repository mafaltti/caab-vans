# Road Snapping — Key Findings

**Recommendation: Self-hosted OSRM, snap at ingestion time**

## Why Self-Hosted?

All commercial APIs cost $491-$2,915/month at current volume (4 vans) and scale linearly. Self-hosting is $0/month forever, regardless of fleet size.

## Why OSRM over Valhalla?

Simpler setup, faster queries, official Docker images. Both use the same algorithm (HMM + Viterbi) and produce comparable accuracy.

## Why Snap at Ingestion (Not Query or Client)?

Snap once when GPS arrives → all consumers (map, ETA, future APIs) get road-snapped coords for free. No frontend changes needed. Falls back to raw GPS if OSRM is down.

## VPS Requirement

Needs 4 GB+ RAM total. OSRM with Nordeste/Bahia OSM extract adds ~2 GB RAM, ~4 GB disk.

## What Changes

- 1 migration (2 new columns on `vans`: `snapped_lat`, `snapped_lng`)
- 1 code change (tracking ingestion handler: call OSRM `/match` with fallback)
- 1 infra addition (`infra/osrm/` Docker Compose stack)
- Zero frontend changes — map component works as-is

## Cost Comparison at a Glance

|  | 4 vans | 10 vans | 50 vans |
|---|---|---|---|
| Self-hosted OSRM | $0 | $0 | $0 |
| Cheapest commercial (Mapbox) | $491/mo | $1,528/mo | $8,440/mo |
| Most expensive (Google) | $2,915/mo | $6,872/mo | $32,960/mo |

The full report is at `docs/execution/0036-road-snapping-analysis.md`. Let me know how you'd like to proceed.
