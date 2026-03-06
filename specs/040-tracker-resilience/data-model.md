# Data Model: Tracker Resilience

**Feature**: 040-tracker-resilience | **Date**: 2026-03-05

## Server-Side Changes

### Modified Table: van_location_pings

New columns added to support health metadata and sequence numbering:

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `seq` | integer | YES | null | Monotonic sequence number per route run |
| `buffer_size` | smallint | YES | null | Client buffer size at time of send |
| `failure_count` | smallint | YES | null | Consecutive failure count at time of send |
| `battery_level` | real | YES | null | Device battery level (0.0-1.0) |
| `network_type` | text | YES | null | Connection type: wifi, cellular, none |

All new columns are nullable to maintain backward compatibility with existing tracker versions during the coordinated deployment.

### New Index

```sql
CREATE INDEX idx_van_location_pings_van_seq
  ON van_location_pings (van_id, seq)
  WHERE seq IS NOT NULL;
```

Partial index for sequence gap detection queries. Only indexes rows with a sequence number.

### Migration Notes

- Single migration file: `00007_tracker_resilience.sql`
- All columns are nullable ADD COLUMN operations — no table lock, no data migration needed
- Existing rows retain null values for new columns

## Client-Side Changes

### Modified Type: LocationPoint

```typescript
interface LocationPoint {
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  ts: number                    // Unix milliseconds
  // New fields
  seq: number | null            // Sequence number (null if no active route run)
  bufferSize: number | null     // Current buffer size
  failureCount: number | null   // Consecutive failures
  batteryLevel: number | null   // 0.0-1.0
  networkType: string | null    // wifi | cellular | none
}
```

### New Module-Level State (task.ts)

```typescript
// Backoff state
let consecutiveFailures: number = 0
let backoffUntil: number = 0       // Unix ms timestamp

// Sequence state
let currentSeq: number = 0         // Resets on route start

// Task health
let lastTaskInvocationAt: number = 0  // For kill detection
```

Hydrated from AsyncStorage on cold start (same pattern as existing `lastSentLat/Lng`).

### New AsyncStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `@consecutiveFailures` | number | Backoff failure counter |
| `@backoffUntil` | number | Unix ms when backoff expires |
| `@currentSeq` | number | Current sequence number |
| `@lastTaskInvocationAt` | number | Last task callback timestamp |

### Modified Storage: Settings

Token storage migrates from AsyncStorage (`@settings`) to `expo-secure-store` for the `ingestionToken` field only. Other settings (`apiBaseUrl`, `vanId`) remain in AsyncStorage.

Migration flow on app launch:
1. Read `@settings` from AsyncStorage
2. If `ingestionToken` exists, write to SecureStore
3. Remove `ingestionToken` from AsyncStorage settings object
4. On subsequent reads, merge AsyncStorage settings + SecureStore token

### Buffer Behavior Changes

| Property | Before | After |
|----------|--------|-------|
| Max size | 50 | 100 |
| Eviction | Drop oldest when full | Same (ring buffer) |
| TTL | None | Discard points > 24h before flush |
| Dedup | Consecutive identical check | Same |
| Concurrency | No protection | In-memory mutex |

## Entity Relationships

```
LocationPoint (client)
  → sent to → van_location_pings (server)
  → contains → health metadata (buffer_size, failure_count, battery_level, network_type)
  → contains → seq (scoped to route_run via route_shifts)

Offline Buffer (client)
  → stores → LocationPoint[]
  → max 100, FIFO with ring eviction
  → TTL: 24h

Tracking Session
  → scoped to → route_run (via Start/End Route)
  → provides → seq counter context
```

## State Machines

### Backoff State

```
NORMAL ──[failure]──→ BACKING_OFF
  ↑                       │
  └──[success]────────────┘

BACKING_OFF:
  - All sending paused
  - Current points buffered
  - Delay: 5s → 10s → 30s → 60s → 2min → 5min (cap)
  - First post-delay attempt = probe
  - On probe success → NORMAL (reset counter)
  - On probe failure → BACKING_OFF (next delay tier)
```

### Auth Failure State

```
NORMAL ──[401]──→ COUNTING
  ↑                  │
  │            [3 consecutive]
  │                  ↓
  └──[success]── PAUSED (alert driver, buffer points)
```

### Battery GPS Mode

```
HIGH_ACCURACY ──[battery < 20%]──→ BALANCED
      ↑                                │
      └────[battery > 25%]─────────────┘

HIGH_ACCURACY: Accuracy.High, timeInterval: 5000ms
BALANCED: Accuracy.Balanced, timeInterval: 10000ms
```
