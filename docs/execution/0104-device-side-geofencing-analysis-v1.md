# Device-Side Geofencing for CAAB Vans Stop Detection

## 1. Current Problem

The system uses server-side geofence detection: every GPS ping received by the server is checked against stop coordinates. This fails when:

| Failure mode | Frequency | Impact |
|---|---|---|
| Communication blackout (Android kills task, network loss) | Multiple times daily on Vans 02/03/04 | Stops passed during silence are missed permanently |
| Sparse pings (throttle, rate limit, stale guard) | Constant when van is moving fast | At 50km/h, a van crosses 50m in 3.6s; with 5–10s ping intervals, pings can miss the geofence entirely |
| Repeated stop visits at different times | Every route (4–10 visits to the same location per day) | If one visit is missed, the pointer gets stuck and all subsequent progress stalls |

Today's data: Van 03 had a 5-minute blackout (20:17–20:28 UTC), Van 02 hit the rate limit ceiling causing a 4-minute cascade, Van 04 was completely dead for the entire monitoring window. All of these cause missed stops.

---

## 2. Proposed Architecture: Device-Side Geofencing

**Principle:** the device detects stops, the server records them. Raw GPS pings are for map display. Stop detection is a separate responsibility handled by the Android OS.

### Data Flow

```
┌─────────────────────────────────────────────────────┐
│                    DEVICE (Tracker App)              │
│                                                      │
│  Driver taps "Iniciar Turno"                         │
│         │                                            │
│         ▼                                            │
│  GET /api/routes/{id}/start                          │
│         │                                            │
│         ▼                                            │
│  Server returns stop coordinates                     │
│         │                                            │
│         ▼                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ Foreground Service   │  │ OS Geofencing        │  │
│  │ (existing)           │  │ (new)                │  │
│  │                      │  │                      │  │
│  │ GPS every 5s ────────┼──┼─► Map display        │  │
│  │ Send pings to server │  │                      │  │
│  │                      │  │ GeofencingClient     │  │
│  │                      │  │ monitors 6-11 regions│  │
│  │                      │  │                      │  │
│  │                      │  │ On enter → buffer    │  │
│  │                      │  │ event in AsyncStorage│  │
│  └──────────────────────┘  └──────────────────────┘  │
│                    │                   │              │
│                    ▼                   ▼              │
│            ┌─────────────────────────────────┐       │
│            │ Next ping to server includes:   │       │
│            │ { lat, lng, ts, ...             │       │
│            │   geofenceEvents: [             │       │
│            │     { stopId, enteredAt, lat }  │       │
│            │   ]                             │       │
│            │ }                               │       │
│            └─────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│                    SERVER                            │
│                                                      │
│  1. Store ping (existing)                            │
│  2. Update van position (existing)                   │
│  3. Process geofenceEvents[] (new):                  │
│     - Validate stopId belongs to active route        │
│     - Mark stop as passed (pass_source:              │
│       "device_geofence", confidence: 0.95)           │
│     - Backfill earlier stops if needed               │
│  4. Server-side inference (existing, as fallback)    │
└─────────────────────────────────────────────────────┘
```

### What Happens During a Blackout

```
18:15  Last ping succeeds, van heading toward Mundo Plaza
18:17  Android kills background task → no more pings
18:19  Van enters Mundo Plaza 150m radius
       → Android GeofencingClient fires callback
       → App stores: { stopId: "mp-1820", enteredAt: 1741..., lat: -12.978 }
18:22  Van leaves Mundo Plaza area
18:25  Task restarts, first ping succeeds
       → Ping includes geofenceEvents: [{ stopId: "mp-1820", ... }]
       → Server marks Mundo Plaza 18:20 as passed ✓
```

The stop is captured even though no GPS ping reached the server for 8 minutes.

---

## 3. Feasibility Assessment

### Expo/React Native Support

| Requirement | Status |
|---|---|
| `expo-location` v55 `startGeofencingAsync()` | Available |
| `expo-task-manager` geofence task | Available |
| `ACCESS_BACKGROUND_LOCATION` permission | Already configured in `app.json` |
| `isAndroidBackgroundLocationEnabled` | Already enabled |
| Foreground service | Already running |

No new dependencies needed. The APIs are already available in the current Expo version.

### Android Geofence Limits

| Constraint | Limit | CAAB Vans need | Status |
|---|---|---|---|
| Max geofence regions | 100 | 6–11 per route | Well within limit |
| Min effective radius | ~100–150m | Need to increase from 50m | Requires `geofence_radius_m` update |
| Entry detection latency | 1–2 min (batched) | Acceptable (buffered anyway) | OK |
| Survives app kill? | Yes (`GeofencingClient` is Play Services) | Critical requirement | Covered |
| Survives device reboot? | No (must re-register) | Need boot receiver | Already exists in app |

### Stop Geometry Per Route

| Route | Unique locations | Visits/day to same location | Min inter-stop distance |
|---|---|---|---|
| Rota 01 | 7 | Up to 7 (Mundo Plaza, Comércio, Fórum) | 682m |
| Rota 02 | 5 | Up to 10 (Mundo Plaza) | 738m |
| Rota 03 | 9 | Up to 8 (Justiça Federal, TRT-5, Mundo Plaza) | 371m |
| Rota 04 | 6 | Up to 10 (Fórum Ruy Barbosa) | 738m |

With a 150m radius, the minimum inter-stop distance (371m on Rota 03) leaves a 71m gap between the two closest geofence circles. No overlap — false matches won't happen.

### Repeated Stops (The Key Problem)

Mundo Plaza appears 10 times on Rota 02. Each visit is a separate schedule entry with the same coordinates. The device registers **one** geofence region for the physical location, but needs to distinguish which schedule entry each visit corresponds to.

**Solution: sequential matching on the device.** The tracker receives stops in chronological order. When a geofence entry fires, it matches the earliest pending schedule entry at that location. The device maintains a local ordered list:

```
Pending: [MP-0645, MP-0745, MP-0925, MP-1125, ...]
Van enters Mundo Plaza → match MP-0645 → remove from pending
Next entry → match MP-0745
```

This is simpler than the server's time-matching algorithm because the device knows the exact moment it entered. No ambiguity about which visit it is — it's always the next pending one.

---

## 4. What Changes

### Tracker App (Expo)

| Change | Description | Effort |
|---|---|---|
| New `stop-geofence-task` | `TaskManager` task that fires on geofence entry, buffers events | ~40 lines |
| Geofence registration on shift start | Call `startGeofencingAsync` with unique stop locations | ~30 lines |
| Geofence unregistration on shift end | Call `stopGeofencingAsync` | ~5 lines |
| Local pending stop state | `AsyncStorage` list of pending stops, sequential matching | ~50 lines |
| Event sync in ping request | Add `geofenceEvents[]` to ping payload | ~15 lines |
| Boot recovery | Re-register geofences on boot if shift was active | ~20 lines |

**Total: ~160 lines of new code in the tracker.**

### Server

| Change | Description | Effort |
|---|---|---|
| `/start` endpoint | Include stop coordinates in response | ~10 lines |
| Tracking endpoint | Accept and process `geofenceEvents[]` in ping body | ~40 lines |
| Validation schema | Add optional `geofenceEvents` to tracking schema | ~10 lines |
| `inferStopProgress` | Skip server-side geofence for stops already confirmed by device | ~5 lines |
| New `pass_source` value | `"device_geofence"` with `0.95` confidence | Trivial |

**Total: ~65 lines of new server code.**

### Database

| Change | Description |
|---|---|
| None | Existing `route_run_stops` schema already supports the new `pass_source` value. No migration needed. |

---

## 5. What Stays the Same

- **GPS pings for map display** — unchanged. The foreground service keeps sending pings for the live dot on the map.
- **Server-side geofence as fallback** — unchanged. For older app versions or if OS geofencing fails, the existing server-side detection still runs.
- **OSRM road snapping** — unchanged. Pings still get snapped for map accuracy.
- **Backfill logic** — unchanged but less needed. Device geofencing catches most stops; backfill handles edge cases.
- **Rate limiter** — unchanged. Geofence events piggyback on existing ping requests, no extra API calls.

---

## 6. Geofence Radius: 50m → 150m

The current 50m radius must increase for OS-level geofencing to work. Android's `GeofencingClient` has an effective accuracy of ~100–150m (uses cell/WiFi positioning, not GPS). A 50m radius would produce unreliable enter/exit events.

150m is safe because:

- Minimum inter-stop distance is 371m (Rota 03) → 371 − (150×2) = 71m gap, no overlap
- At 50km/h, a van spends ~22 seconds inside a 150m radius — plenty of time for detection
- The device reports the actual GPS coordinates at entry time, so the server can verify accuracy

This radius change benefits both the new device geofencing **and** the existing server-side fallback.

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `GeofencingClient` not available (no Play Services) | Very low — all current devices have it | Fall back to server-side detection |
| Geofence event delayed >5 minutes | Low on Android | Events are buffered, eventual consistency is acceptable |
| False entry (GPS drift triggers geofence while parked nearby) | Medium with 150m radius | Sequential matching prevents duplicate entries; the van must enter-exit-enter for a second match |
| Stop coordinates change in admin panel | Low | Re-register geofences when stop list changes (poll or push via server) |
| Device reboot mid-shift | Occasional | Boot receiver re-registers geofences from `AsyncStorage` state |

---

## 8. Summary

| Aspect | Current (server-side) | Proposed (device-side) |
|---|---|---|
| Detection reliability | Depends on ping timing + network | OS-level, works offline |
| Survives blackouts | No | Yes |
| Survives app kill | No | Yes (Play Services) |
| Repeated stop matching | Time-proximity (fragile) | Sequential order (deterministic) |
| Confidence level | 0.3–0.9 (varies) | 0.95 (OS-confirmed) |
| Battery impact | Already running foreground GPS | Negligible addition (OS batches geofence checks) |
| Code complexity | ~450 lines in `inferStopProgress` | ~160 lines on device + ~65 lines on server |
| Fallback | None | Server-side detection remains as fallback |

The device-side approach is more reliable, simpler, and covers every failure mode observed in production. It aligns with industry standard for fleet tracking. The existing server-side system stays as a fallback, making this a low-risk addition.
