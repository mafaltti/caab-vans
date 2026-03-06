# Research: Fix timeFactor Instability

## Decision 1: Prediction Baseline Approach

**Decision**: Use a fixed reference speed constant (~8.3 m/s / 30 km/h) for computing `predictedMinutes` in `recentRuns`.

**Rationale**:
- The `actual / predicted` ratio is relative — the absolute value of `predictedMinutes` doesn't matter for correctness, only that it remains **constant across API calls** so the ratio changes only when new stops are passed.
- A fixed constant has zero computational overhead and zero network calls.
- The reference speed cancels out in the ratio math: if all segments use the same constant, the median ratio purely reflects how actual segment times compare to each other scaled by distance.

**Alternatives considered**:
1. **OSRM duration per stop pair** — Most accurate but adds N OSRM calls per request (currently 0 for recentRuns). No caching exists. Each call has 100ms timeout. Rejected: violates KISS and SC-004 (zero additional network overhead).
2. **Smoothed speed (last 10 pings)** — Better than instantaneous but still shifts between requests. Already computed in `computeSmoothedSpeed()` but would not fully eliminate the volatility. Rejected: doesn't solve the root problem.
3. **Historical average speed** — Compute average from past route runs. Requires DB queries and schema changes. Rejected: over-engineering for the problem at hand.

## Decision 2: Minimum Segment Thresholds

**Decision**: Filter out inter-stop segments with haversine distance < 100m or actual travel time < 0.5 minutes (30 seconds).

**Rationale**:
- Very short segments (close stops or geofence overlap) produce unreliable ratios due to GPS noise and timing granularity.
- 100m distance threshold: below this, haversine error margin is comparable to the measurement, making the ratio meaningless.
- 30-second time threshold: GPS timestamps have ~5s granularity; ratios from sub-30s segments are noise-dominated.

**Alternatives considered**:
- 50m / 10s (from spec): slightly too aggressive — GPS error at 50m is ~10% of measurement. 100m / 30s gives cleaner signal.
- No filtering: current behavior allows noise from tiny segments.

## Decision 3: Code Deduplication

**Decision**: Extract the `recentRuns` building loop into a shared helper function in `src/lib/tracking/time-factors.ts`.

**Rationale**:
- The identical `recentRuns` loop is duplicated in both `src/app/api/routes/[routeId]/route.ts` (lines 204-217) and `src/app/api/routes/route.ts` (lines 196-209).
- This is exactly 2 occurrences — normally below the 3-repetition threshold for DRY extraction. However, both must be fixed identically and the loop has meaningful domain logic (reference speed, thresholds). Extracting prevents them from diverging.
- The function fits naturally in `time-factors.ts` alongside `computeRecentFactor` and `RecentRun`.

**Alternatives considered**:
- Fix both inline: risk of divergence on future changes. The two copies are byte-for-byte identical, so extraction is straightforward.

## Decision 4: Reference Speed Value

**Decision**: 8.3 m/s (approximately 30 km/h).

**Rationale**:
- Represents typical urban bus/van speed for the Salvador, BA area.
- The exact value is mathematically irrelevant — it cancels out in the ratio computation. What matters is constancy.
- Named constant `REFERENCE_SPEED_MPS` for clarity.

**Alternatives considered**:
- 11.1 m/s (40 km/h): also valid; no difference in outcome.
- Configurable per route: YAGNI — the value doesn't affect results.
