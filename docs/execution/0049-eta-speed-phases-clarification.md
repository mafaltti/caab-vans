# ETA Speed Phases — Clarification

> About Phase 3, it will replace actual speed of the van by average observed speed in that time frame historically?

● Good question. No — Phase 3 as designed in the doc does not replace GPS speed. Let me clarify what each phase actually uses:

## How Speed Is Used Across Phases

| Phase   | Distance source                              | Speed source                      | Notes                                                         |
|---------|----------------------------------------------|-----------------------------------|---------------------------------------------------------------|
| Current | Haversine × 1.3                              | GPS speed (real-time)             | Both are weak                                                 |
| Phase 1 | OSRM `/route` distance                       | GPS speed (real-time)             | Fixes distance, keeps real-time speed                         |
| Phase 3 | OSRM `/route` duration (with historical speeds baked in) | OSRM profile speeds (historical averages) | Replaces GPS speed with historical averages |

So yes — Phase 3 does replace the van's actual current speed with historical averages baked into OSRM's graph. That's the trade-off:

- **Pro:** Captures time-of-day patterns (rush hour slowdowns) across the entire remaining route, not just the van's current spot
- **Con:** Ignores what the van is actually doing right now — a van moving at 5 km/h in unusual congestion still gets the "average 7:30 AM speed" ETA

## Is That a Problem?

For Phase 1 (Strategy B), the strength is that GPS speed reflects reality right now. Phase 3 throws that away in favor of statistical averages. This is a real trade-off.

## Better Approach: Combine Both

The doc's traffic-researcher actually flagged this — **Approach F (hybrid)** keeps GPS speed and adds a time-of-day correction factor:

```js
// Phase 1 baseline: OSRM road distance + real-time GPS speed
const baseMinutes = osrmDistance / vanPosition.speedMps / 60;

// Phase 3 alternative: apply time-of-day factor ON TOP of GPS speed
const factor = WEEKDAY_FACTORS[currentHour] ?? 1.0;
const travelMinutes = baseMinutes * factor;
```

This way:

- Distance comes from OSRM (accurate road geometry)
- Speed comes from GPS (real-time reality)
- Correction adjusts for the fact that current speed won't hold for the whole route (rush hour ahead, etc.)

This is strictly better than replacing GPS speed entirely with historical averages. The factor captures "the rest of the route will be slower/faster than your current speed" without discarding reality.

---

Want me to update the doc to clarify this distinction and make Phase 3 use the hybrid approach (GPS speed + correction factor) instead of pure OSRM historical duration?
