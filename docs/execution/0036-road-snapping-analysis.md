# Road Snapping / Map Matching Analysis for CAAB Vans

**Date**: 2026-03-03
**Context**: Van marker on the embedded live map sometimes appears on buildings or sidewalks instead of roads due to GPS inaccuracy (3-15m). This analysis evaluates approaches to "snap" the van position to the nearest road.

---

## 1. The Problem

Raw GPS coordinates from the van-tracker phones have 3-15m accuracy. At close zoom levels, the van marker may appear on a building, parking lot, or sidewalk instead of the road. Road snapping projects the GPS point onto the nearest road segment in the network.

---

## 2. Technical Approaches

### 2.1 `/nearest` — Single-Point Snapping

Snaps one GPS coordinate to the geometrically closest road segment. Fast (sub-millisecond), but treats each point independently — can snap to the wrong road at intersections or parallel roads.

### 2.2 `/match` — Trajectory-Based Map Matching

Takes a sequence of GPS points with timestamps and uses a Hidden Markov Model (Viterbi algorithm) to find the most probable path on the road network. Significantly more accurate for vehicles because it considers trajectory context, speed, and road topology. Returns `null` for outlier points that can't be matched. Latency: 5-50ms per batch.

**For vehicle tracking, `/match` is the better choice** — it resolves ambiguities at intersections and parallel roads that `/nearest` cannot.

---

## 3. Where to Snap in the Architecture

### Option A: Snap at Ingestion Time (Recommended)

**Where**: In `src/app/api/tracking/[vanId]/route.ts`, after payload validation, before writing to `vans` table.

| Pros | Cons |
|------|------|
| Snap once, all consumers benefit automatically | Adds ~5ms to ingestion path |
| Map component needs zero changes | OSRM becomes a soft dependency |
| ETA computation also improves (snapped coords are more road-aligned) | Must handle OSRM-down gracefully |
| Raw GPS preserved in `van_location_pings` audit trail | |

**Failure mode**: If OSRM is down → fall back to raw coordinates. System works exactly as today.

### Option B: Snap at Query Time (BFF)

**Where**: In `src/app/api/routes/[routeId]/route.ts`, before constructing response.

| Pros | Cons |
|------|------|
| Raw data preserved everywhere | Repeated snapping on every poll (wasteful) |
| Easy rollback | Must duplicate logic in both list and detail APIs |
| | Adds latency to every user request |

### Option C: Snap on the Client

**Verdict: Not feasible.** Exposes OSRM to public internet, requires CORS/auth, adds latency on mobile networks, only fixes display but not ETA, adds complexity to the map component.

### Option D: Store Both Raw + Snapped Columns

Add `snapped_lat`/`snapped_lng` to `vans` table. Combines with Option A — raw preserved in `van_location_pings`, snapped served via API. Clean separation of concerns.

**Recommended combination: Option A + D** — snap at ingestion, store snapped in dedicated columns, serve snapped when available with raw fallback.

---

## 4. Self-Hosted Engines

### OSRM vs Valhalla

| Factor | OSRM | Valhalla (Meili) |
|--------|------|------------------|
| Map matching quality | Excellent (HMM + Viterbi) | Excellent (same algorithm) |
| Query speed | Faster (precomputed graph) | Slightly slower (on-demand tiles) |
| Runtime RAM (Nordeste) | ~2-4 GB | ~1-2 GB |
| Disk (processed data) | ~2-4 GB | ~2-3 GB |
| Docker support | Official images, well-documented | Community images (gis-ops) |
| API style | GET with URL params | POST with JSON body |
| Extra features | Routing, distance matrix | Isochrones, elevation, multi-modal |
| Community | Larger, more battle-tested for map matching | Growing, good docs |

**Recommendation: OSRM** — simpler setup, faster queries, official Docker images, most widely used for this exact use case. Valhalla is a viable alternative if RAM is tight (< 2 GB available).

### Data Source

**Geofabrik Nordeste extract** (406 MB PBF) — covers all of Bahia. Processing time: ~15-30 min. Update frequency: monthly is sufficient.

### VPS Feasibility

Current VPS load: ~600 MB - 1.1 GB RAM (Supabase stack + Next.js + Caddy).

| VPS RAM | Feasibility |
|---------|-------------|
| 2 GB | Too tight — OSRM would cause swapping |
| 4 GB | Comfortable — ~1 GB current + ~2 GB OSRM leaves headroom |
| 8 GB | No issues |

### Infrastructure Setup

New Docker Compose stack at `infra/osrm/docker-compose.yml`:
- OSRM container with Nordeste MLD data
- Next.js reaches it via `localhost:5000`
- Follows existing pattern of separate compose stacks

---

## 5. Commercial Alternatives — Cost Comparison

### Current volume: 4 vans × 4 pings/min × 12 hours/day × 30 days = ~345,600 req/month

| Service | Free Tier | Price/1K req | Monthly Cost | Annual Cost |
|---------|-----------|-------------|-------------|-------------|
| **Self-hosted OSRM** | Unlimited | $0 | **$0** | **$0** |
| **Self-hosted Valhalla** | Unlimited | $0 | **$0** | **$0** |
| Mapbox Map Matching | 100K/mo | ~$2.00 | ~$491 | ~$5,892 |
| GraphHopper Hosted | ~15K/mo | Flat €479/mo | ~$520 | ~$6,240 |
| TomTom Snap to Roads | ~75K/mo | $2.50 | ~$677 | ~$8,124 |
| Radar Route Matching | 100K/mo | $5.00 | ~$1,228 | ~$14,736 |
| HERE Route Matching | 2.5K/mo | $5.00 | ~$1,716 | ~$20,592 |
| Google Roads API | 5K/mo | $10.00 | ~$2,915 | ~$34,980 |

### Scaling projections (monthly cost)

| Service | 4 vans | 10 vans | 20 vans | 50 vans |
|---------|--------|---------|---------|---------|
| Self-hosted | $0 | $0 | $0 | $0 |
| Mapbox | ~$491 | ~$1,528 | ~$3,256 | ~$8,440 |
| TomTom | ~$677 | ~$1,973 | ~$4,131 | ~$10,613 |
| Google | ~$2,915 | ~$6,872 | ~$13,816 | ~$32,960 |

---

## 6. Impact on Existing Features

| Feature | Impact |
|---------|--------|
| **Map van marker** | Automatically snapped — no code changes |
| **ETA computation** | Improves — snapped coords make haversine × ROAD_FACTOR more accurate |
| **Geofence detection** | No change — should continue using raw GPS (snapped coords could cause false positives) |
| **van_location_pings** | No change — raw audit trail preserved |
| **Route detail API** | Serve `snapped_lat`/`snapped_lng` as `lastLat`/`lastLng` when available |

---

## 7. Implementation Effort Estimate

| Task | Effort |
|------|--------|
| Supabase migration (2 columns on `vans`) | Small |
| OSRM Docker setup + Nordeste data | Medium (one-time) |
| Ingestion handler: add OSRM `/match` call with fallback | Medium |
| Route detail API: prefer snapped coords | Small |
| Type updates | Small |
| Monthly OSRM data refresh script | Small |

**Total**: Medium effort. No frontend changes needed.

---

## 8. Recommendation

**Self-hosted OSRM with Nordeste extract, snapping at ingestion time.**

Rationale:
1. **Zero per-request cost** — aligns with project's self-hosted philosophy
2. **Snap once at ingestion** — all consumers benefit, no repeated work
3. **Graceful degradation** — falls back to raw GPS if OSRM is down
4. **Fits on VPS** — ~2 GB additional RAM for Nordeste region (needs 4 GB+ VPS)
5. **No frontend changes** — map component works as-is
6. **ETA improves as a side-effect** — snapped coords are more road-aligned
7. **Raw data preserved** — `van_location_pings` untouched for audit

### What NOT to do
- Do NOT snap on the client — exposes infra, adds latency, inconsistent with ETA
- Do NOT snap at query time — wasteful, DRY violation, cache complexity
- Do NOT make OSRM a hard dependency — always fall back to raw
- Do NOT add snapped columns to `van_location_pings` — only `vans` table needs them

### Prerequisites
- VPS must have **4 GB+ RAM** (check current VPS specs)
- Disk: ~5 GB free for OSRM processed data + temp space during build

---

## 9. Development Path

1. **Phase 1 (Dev/Test)**: Use OSRM public demo server (`router.project-osrm.org`) — 1 req/sec limit is fine for development
2. **Phase 2 (Staging)**: Self-host OSRM on VPS with Nordeste extract
3. **Phase 3 (Production)**: Enable in tracking ingestion with fallback, add monitoring

---

*Report compiled from parallel research by 3 agents: OSRM technical analysis, architecture integration analysis, and commercial alternatives cost analysis.*
