# ETA Prediction — Industry Best Practices

> Is this the best approach used by industry?

● Good question. Let me research what the industry actually uses for transit/fleet ETA prediction.

● Web Search(`"transit ETA prediction methods industry best practices real-time GPS 2024 2025"`)

● Web Search(`"Uber Lyft ETA prediction architecture road segment travel time estimation"`)

● Fetch(`https://blog.transitapp.com/better-predictions/`)

● Fetch(`https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/`)

● Honest answer: the architecture is right, the correction mechanism is simplified for our scale.

## What the Industry Does

The industry standard is a **two-layer approach** — and it's exactly what we're proposing, just at different complexity levels:

### Layer 1: Routing Engine Baseline

Every major player starts with a routing engine (graph-based segment traversal times):

- **Uber:** OSRM-like routing engine summing segment travel times
- **Google Maps:** Segment-level travel times from aggregated fleet GPS
- **Transit App:** Stop-to-stop historical travel times

This is our **Phase 1** (`OSRM /route`).

### Layer 2: Data-Driven Correction on Top

Nobody stops at the routing engine. They all add a correction layer:

| Company              | Correction method                                                                 | Why                                      |
|----------------------|-----------------------------------------------------------------------------------|------------------------------------------|
| Uber (DeepETA)       | Deep neural network predicting the residual (gap between routing engine ETA and reality) | Millions of trips/day, global scale |
| Transit App          | Historical stop-to-stop travel times + recency weighting (last few hours weighted more than historical average) | Per-city, per-route models |
| Google Maps          | Real-time traffic from billions of Android phones + historical patterns           | Massive crowdsourced data                |

## How Our Approach Compares

Our Phase 3 correction factor is conceptually identical to Uber's DeepETA residual:

```
Uber:    final_eta = routing_engine_eta + ML_residual(features)
Us:      final_eta = (osrm_distance / gps_speed) × correction_factor(hour, day)
```

Both predict "how wrong is the baseline, and by how much?" The difference is the correction mechanism:

| Aspect           | Uber/Google                                     | Transit App                       | CAAB (ours)                  |
|------------------|-------------------------------------------------|-----------------------------------|------------------------------|
| Data volume      | Millions of trips/day                           | Thousands/day per city            | ~10 trips/day                |
| Correction method | Deep neural network                            | ML model + recency                | Lookup table                 |
| Features         | Origin, dest, time, traffic, weather, events    | Route, time, recent trips         | Hour, day-of-week, route     |
| Appropriate?     | Yes (massive data)                              | Yes (medium data)                 | Yes (small data)             |

## What We're Missing (and Whether It Matters)

### 1. Recency Weighting

Transit App weights the last few hours more than historical averages. If a bus was slow in the last 2 hours, the next prediction reflects that.

This is a meaningful improvement we could add cheaply:

```js
// Instead of just historical median:
const factor = 0.7 * historicalFactor(hour) + 0.3 * recentFactor(lastFewRuns);
```

This captures "today is unusually bad/good" without ML. Worth considering for Phase 3.

### 2. ML Residual Prediction

Uber's approach. Not appropriate for 3–5 vans — insufficient data to train a meaningful model.

### 3. Real-Time Traffic Feed

Google's approach via crowdsourced data. We don't have this data source and external providers are over-engineered for our scale (as analyzed).

## Bottom Line

Our approach follows the same **two-layer architecture** the industry uses. The correction factor is the right mechanism at our data scale. The one technique worth borrowing from Transit App is **recency weighting** — blending "what usually happens at 8 AM" with "what happened on today's earlier runs."

Want me to add recency weighting to the Phase 3 design in the doc?

## Sources

- <https://www.uber.com/blog/deepeta-how-uber-predicts-arrival-times/>
- <https://blog.transitapp.com/better-predictions/>
- <https://blog.transitapp.com/how-on-target-is-that-eta-really-now-theres-a-way-to-know/>
- <https://github.com/TransitApp/ETA-Accuracy-Benchmark>
- <https://www.uber.com/blog/engineering-routing-engine/>
- <https://newsletter.systemdesign.one/p/uber-eta>
