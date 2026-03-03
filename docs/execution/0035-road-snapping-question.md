# Road Snapping for Van Position on Map

## QUESTION: Regarding "Van position on map — Pulsing blue dot with smooth animation between polling updates" is there anyway to make it "keep in roads" instead of places of building or whatever?

That's called **road snapping** (or map matching). The raw GPS coordinates from the phone can be a few meters off, placing the marker on a building or sidewalk instead of the road.

There are a few approaches, each with different trade-offs:

### 1. OSRM Nearest API (simplest)

Call OSRM's `/nearest` endpoint to snap each GPS point to the nearest road segment. One HTTP call per position update. Could be done in the BFF (tracking ingestion or route detail API) so the frontend gets pre-snapped coordinates.

### 2. OSRM Match API (best quality)

Send a trace of recent GPS points to `/match`, which uses the full road network to infer the most likely road path. Better accuracy than single-point snapping, especially at intersections.

### 3. Self-hosted OSRM on your VPS

Download Brazil OSM extract, run OSRM in Docker alongside Supabase. Full control, no rate limits, no cost. But adds ~1-2GB disk + some RAM.

### 4. Third-party APIs (Mapbox, Google Roads)

Best quality but per-request cost and vendor lock-in — conflicts with the project's self-hosted philosophy.

## Reality Check

With 15-second GPS polling on a phone, the marker is typically 3-15m from the actual road position. On a zoomed-out map (zoom 14), this offset is barely visible. It becomes more noticeable only when a user zooms in.
