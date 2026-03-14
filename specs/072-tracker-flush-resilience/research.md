# Research: Tracker Flush Resilience

**Date**: 2026-03-13

## No NEEDS CLARIFICATION items

All technical context was resolved through production log analysis and direct code investigation. No external research was needed.

## Decisions

### D1: Flush concurrency guard — boolean flag vs promise-chain mutex

- **Decision**: Simple boolean flag (`isFlushing`)
- **Rationale**: The requirement is skip-not-queue (FR-002). A boolean flag is the simplest mechanism to detect "already running" and return early. A promise-chain mutex (like buffer.ts `withMutex`) would queue callers, which is explicitly not wanted. The flag is in-memory only (FR-003), naturally reset on process restart.
- **Alternatives considered**:
  - Promise-chain mutex: Rejected — queues callers instead of skipping, creates 200 serialized empty flushes
  - Debounce timer: Rejected — adds delay to first flush; doesn't prevent concurrent execution during the debounce window
  - Semaphore with count: Over-engineered for a single-concurrency guard

### D2: 429 backoff — reuse existing mechanism vs separate strategy

- **Decision**: Reuse existing `onSendFailure()` and `BACKOFF_DELAYS` (5s → 10s → 30s → 60s → 120s → 300s)
- **Rationale**: The existing backoff infrastructure (state persistence, hydration on cold start, backoff check in task callback) is already correct and tested. Adding `await onSendFailure()` to the 429 branches is a 2-line change that gets full backoff behavior for free. No need for a separate Retry-After header parser — the server doesn't send one and the existing delays are appropriate.
- **Alternatives considered**:
  - Separate 429-specific backoff curve: Rejected — YAGNI, the existing curve is already conservative
  - Retry-After header parsing: Deferred — server doesn't currently send this header; can be added later if needed

### D3: Geofence grace period — module-level timestamp vs AsyncStorage

- **Decision**: Module-level `const bootTimestamp = Date.now()` set at module load time
- **Rationale**: The grace period only needs to suppress events in the current process lifetime. Module-level initialization happens exactly once per cold start (when the task manager loads the module). No persistence needed — if the process restarts, the new module load creates a new timestamp, which is exactly the desired behavior.
- **Alternatives considered**:
  - AsyncStorage-persisted boot time: Rejected — adds unnecessary I/O; the grace period is inherently per-process
  - expo-task-manager registration timestamp: Not available in the callback API

### D4: In-memory geofence dedup — Map vs Set

- **Decision**: `Map<string, number>` mapping placeId to last-entered timestamp
- **Rationale**: The existing persisted buffer dedup checks `placeId + enteredAt < 60s`, but when 34 events arrive in 90ms, the buffer hasn't been written to AsyncStorage yet between events. An in-memory Map provides instant O(1) lookup without async I/O. The Map stores timestamps (not just presence) so the 60s dedup window logic is preserved.
- **Alternatives considered**:
  - Set of placeIds: Rejected — no time window, would permanently suppress after first entry
  - Debounced callback: Rejected — Expo task manager doesn't support debouncing OS callbacks
