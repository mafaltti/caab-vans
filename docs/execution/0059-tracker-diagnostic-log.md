# Tracker Diagnostic Log — Design Spec

## Problem

When a driver reports "tracking wasn't working," there is zero data to investigate. The app persists only `@lastError` (a single string, overwritten each callback) and `@lastSentAt` (one timestamp). You cannot distinguish between:

- GPS was off or inaccurate
- Phone had no network
- Android killed the background task
- Buffer overflowed and dropped points
- Server was returning errors
- App was throttling correctly (van stationary)

## Constraint

Vans operate up to **15 hours/day**. The log must cover a full shift without losing early-day data.

## Goal

A lightweight diagnostic log stored in AsyncStorage that records tracker activity over a full 15-hour day. Uses **minute-level summaries** for routine events and **individual entries** for state changes and errors. Viewable in-app for driver self-diagnosis, and exportable (copy to clipboard) for remote support.

## Design

### Two-tier log structure

The key insight: you don't need to know about every single successful ping. You need to know **when things changed** — when it went offline, when errors started, when the buffer flushed, when the task was killed.

**Tier 1 — Minute summaries** (routine events, aggregated per minute):
```typescript
interface MinuteSummary {
  type: "summary";
  t: number;              // Minute start timestamp (floored to minute)
  ok: number;             // send_ok count
  fail: number;           // send_fail count
  buf: number;            // buffered count
  thr: number;            // throttled count
  flt: number;            // filtered count
  cb: number;             // task_callback count (proves task alive)
}
```

**Tier 2 — Individual events** (state changes, errors, rare events):
```typescript
type EventType =
  | "tracking_start"     // Driver pressed Start
  | "tracking_stop"      // Driver pressed Stop
  | "cold_start"         // Task hydrated from storage
  | "task_error"         // TaskManager reported an error
  | "flush"              // Buffer flush completed (sent/dropped counts)
  | "buffer_full"        // Buffer overflow — data loss
  | "network_down"       // Connectivity lost (first occurrence)
  | "network_up"         // Connectivity restored
  | "error"              // Server error, auth error, unexpected error
  | "state_change";      // Transition: moving->stationary or vice-versa

interface EventEntry {
  type: "event";
  t: number;             // Date.now()
  e: EventType;
  d?: string;            // Detail (max 80 chars)
}
```

**Union type:**
```typescript
type LogEntry = MinuteSummary | EventEntry;
```

### Why this works for 15 hours

| Log tier | Entries per hour | 15 hours | Bytes each | Total |
|----------|-----------------|----------|------------|-------|
| Minute summaries | 60 | 900 | ~70 bytes | ~63KB |
| Events (errors, state changes) | ~5-10 | ~75-150 | ~80 bytes | ~12KB |
| **Total** | | **~1,000-1,050** | | **~75KB** |

~75KB in AsyncStorage is well within limits. One entry per minute is 15x more compact than one entry per GPS callback.

### Max entries: 1,100

Covers 15h of minute summaries (900) plus ~200 event entries. Safety margin for busy error periods.

### Module: `src/storage/diag-log.ts`

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_KEY = "@diagLog";
const MAX_LOG_SIZE = 1100;

// --- Types ---

interface MinuteSummary {
  type: "summary";
  t: number;
  ok: number;
  fail: number;
  buf: number;
  thr: number;
  flt: number;
  cb: number;
}

type EventType =
  | "tracking_start" | "tracking_stop" | "cold_start"
  | "task_error" | "flush" | "buffer_full"
  | "network_down" | "network_up" | "error" | "state_change";

interface EventEntry {
  type: "event";
  t: number;
  e: EventType;
  d?: string;
}

type LogEntry = MinuteSummary | EventEntry;

// --- In-memory state ---

let diskLog: LogEntry[] | null = null;
let currentMinute: MinuteSummary | null = null;
let pendingEvents: EventEntry[] = [];
let lastNetworkState: boolean | null = null;

function getMinuteTs(): number {
  const now = Date.now();
  return now - (now % 60_000);
}

function ensureCurrentMinute(): MinuteSummary {
  const minuteTs = getMinuteTs();
  if (!currentMinute || currentMinute.t !== minuteTs) {
    // Previous minute is done — stage it for disk flush
    if (currentMinute && countOf(currentMinute) > 0) {
      pendingEvents.unshift(currentMinute as unknown as EventEntry);
      // (pendingEvents is really LogEntry[] — flush handles both types)
    }
    currentMinute = {
      type: "summary", t: minuteTs,
      ok: 0, fail: 0, buf: 0, thr: 0, flt: 0, cb: 0,
    };
  }
  return currentMinute;
}

function countOf(s: MinuteSummary): number {
  return s.ok + s.fail + s.buf + s.thr + s.flt + s.cb;
}

// --- Public API: increment counters (synchronous, no I/O) ---

export function logOk(): void        { ensureCurrentMinute().ok++; }
export function logFail(): void      { ensureCurrentMinute().fail++; }
export function logBuffered(): void  { ensureCurrentMinute().buf++; }
export function logThrottled(): void { ensureCurrentMinute().thr++; }
export function logFiltered(): void  { ensureCurrentMinute().flt++; }
export function logCallback(): void  { ensureCurrentMinute().cb++; }

// --- Public API: individual events (synchronous, no I/O) ---

export function logEvent(event: EventType, detail?: string): void {
  pendingEvents.push({
    type: "event",
    t: Date.now(),
    e: event,
    d: detail ? detail.slice(0, 80) : undefined,
  });
}

// Track network transitions (only log on change, not every check)
export function logNetworkState(connected: boolean): void {
  if (lastNetworkState === null) {
    lastNetworkState = connected;
    return;
  }
  if (connected !== lastNetworkState) {
    logEvent(connected ? "network_up" : "network_down");
    lastNetworkState = connected;
  }
}

// --- Disk persistence (async, call periodically) ---

export async function flushLog(): Promise<void> {
  // Collect completed minute + pending events
  const toFlush: LogEntry[] = [...pendingEvents] as LogEntry[];
  pendingEvents = [];

  if (toFlush.length === 0) return;

  if (diskLog === null) {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      diskLog = raw ? JSON.parse(raw) : [];
    } catch {
      diskLog = [];
    }
  }

  diskLog.push(...toFlush);

  if (diskLog.length > MAX_LOG_SIZE) {
    diskLog.splice(0, diskLog.length - MAX_LOG_SIZE);
  }

  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(diskLog));
}

export async function getLog(): Promise<LogEntry[]> {
  await flushLog();
  // Include current (incomplete) minute for display
  const result = [...(diskLog ?? [])];
  if (currentMinute && countOf(currentMinute) > 0) {
    result.push(currentMinute);
  }
  return result;
}

export async function clearLog(): Promise<void> {
  pendingEvents = [];
  currentMinute = null;
  diskLog = [];
  await AsyncStorage.removeItem(LOG_KEY);
}
```

### Integration Points in `task.ts`

```
Line 67  (task callback entry):  logCallback()
Line 69  (task error):           logEvent("task_error", error.message)
Line 101 (cold start hydration): logEvent("cold_start")
Line 122 (accuracy filter):      logFiltered()
Line 127 (duplicate ts):         logFiltered()
Line 131 (stale fix):            logFiltered()
Line 145 (stationary skip):      logThrottled()
Line 148 (too close/soon):       logThrottled()
Line 161 (network check):        logNetworkState(netState.isConnected)
Line 163 (no network → buffer):  logBuffered()
Line 168 (flush start):          logEvent("flush", `start n=${buffer.length}`)
         (after flush):          logEvent("flush", `done sent=${consumed}`)
Line 173 (send success):         logOk()
Line 184 (rate limited):         logFail()
Line 187 (validation error):     logEvent("error", `400: ${result.message}`)
Line 191 (auth/not found):       logEvent("error", `${result.status}: ${result.message}`)
Line 199 (network error):        logBuffered()
Line 204 (unexpected error):     logEvent("error", err.message)
```

Disk flush (`flushLog()`) should run:
- Once per minute (when `ensureCurrentMinute()` detects minute rollover)
- After `logEvent()` calls (errors and state changes are important to persist)
- On `tracking_stop`

This means ~1 disk write per minute in steady state.

### Integration in `tracking.ts`

```
startTracking():  logEvent("tracking_start"); await flushLog()
stopTracking():   logEvent("tracking_stop"); await flushLog()
```

### UI: Diagnostic Screen

Add a new route `app/diagnostics.tsx` accessible from Settings. Shows:

**Summary bar** (computed from all minute summaries):
- Total: sent / failed / buffered / throttled / filtered
- Uptime: first `tracking_start` to now
- Task alive: time since last minute with `cb > 0`

**Timeline view** (FlatList, newest first):
- **Minute rows**: `06:42 | ok:12 fail:0 buf:0 thr:3 flt:1 cb:12`
  - Green background if all ok, yellow if any fail/buf, red if fail > ok
  - Gray if all throttled/filtered (van stationary — normal)
- **Event rows**: `06:42:17 | NETWORK_DOWN` or `06:40:03 | FLUSH done sent=23`
  - Red for errors, blue for state changes, gray for flushes

**Gaps are visible**: If minute 06:42 has `cb:12` and minute 06:55 has `cb:10` but minutes 06:43-06:54 are missing, the task was killed for 12 minutes. The UI can highlight these gaps.

**Actions**:
- "Share Log" — writes log to a temp file, opens native Share sheet. Driver picks WhatsApp, Telegram, email, etc.
- "Clear Log" — resets the log

### Share flow

```
Driver taps "Share Log"
  -> getLog() collects all entries
  -> Write JSON to FileSystem.cacheDirectory/caab-tracker-log-2026-03-05.json
  -> Sharing.shareAsync(fileUri, { mimeType: "application/json" })
  -> Android Share sheet opens -> driver picks WhatsApp/Telegram/etc.
```

Dependencies: `expo-file-system` and `expo-sharing` — both included in Expo managed workflow, no extra install.

### What This Enables

| Scenario | What the log shows |
|----------|--------------------|
| Normal day, moving | 900 minute summaries with ok:2-3, cb:12 each |
| Van stationary 2h | Minutes with thr:12, ok:1, cb:12 (1 ping/min + throttled) |
| No network for 20 min | `network_down` event, minutes with buf:3-12, then `network_up` + `flush done` |
| Android killed task | Gap in minute summaries (no entries for 06:43-06:54). Clear visual hole. |
| Server 500s for 1h | 60 minutes with fail > 0, ok = 0. Error events with status codes. |
| GPS bad (tunnel) | Minutes with flt:12, ok:0 |
| Buffer overflow | `buffer_full` events during long outage |
| Auth token revoked | Repeated `error: 401` events |

### What This Does NOT Do

- Does not send logs to the server (no new endpoint, no bandwidth cost)
- Does not replace a proper error reporting service (Sentry) — that's a separate improvement
- Does not persist across app uninstall (AsyncStorage is cleared)

## Size / Performance Impact

- **Storage**: ~75KB max in AsyncStorage (1,100 entries)
- **Memory**: Current minute summary (1 object) + pending events (typically 0-5)
- **CPU**: Counter increments are synchronous, negligible
- **Disk I/O**: ~1 AsyncStorage write per minute (on minute rollover), not per GPS callback
- **Bundle size**: ~100 lines of new code, no new dependencies
- **Diagnostics screen**: Only loaded on-demand (lazy route)

## Implementation Checklist

1. Create `src/storage/diag-log.ts` (two-tier log module)
2. Add counter calls (`logOk`, `logFail`, etc.) at integration points in `task.ts`
3. Add `logEvent()` calls for state changes and errors in `task.ts`
4. Add `logNetworkState()` call after NetInfo check in `task.ts`
5. Add `logEvent()` calls in `tracking.ts` (start/stop)
6. Wire `flushLog()` to minute rollover and error events
7. Create `app/diagnostics.tsx` (timeline UI screen)
8. Add navigation to diagnostics from Settings screen
9. Test: verify minute summaries aggregate correctly over 1h
10. Test: verify events (errors, flushes, state changes) appear individually
11. Test: verify log doesn't exceed 1,100 entries after 15h simulation
12. Test: verify "Share Log" opens Share sheet with parseable JSON file
13. Test: verify gaps in minute summaries are detectable (task kill scenario)
