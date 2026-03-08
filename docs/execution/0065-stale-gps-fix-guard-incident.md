# CAAB Tracker — Stale GPS Fix Guard Blocking All Pings

**Date:** 2026-03-06
**Affected:** All 4 vans (Van 01, 02, 03, 04)
**Severity:** High — completely prevents real-time tracking
**File:** `apps/van-tracker/src/location/task.ts`

---

## Summary

The tracker app's stale fix guard (`Date.now() - point.ts > 60_000`) rejects GPS fixes older than 60 seconds. After an app restart, cold start, or boot restart, Android returns cached GPS locations while the hardware acquires a fresh satellite lock. These cached fixes have old timestamps, causing 100% of GPS callbacks to be filtered out. The result: the app reports "tracking" but sends zero data.

The recently implemented boot restart feature (#46) ensures the tracker auto-starts after reboots, but it does not solve this issue — the stale fix guard blocks pings regardless of how tracking was started.

---

## Evidence

### Diagnostic Log (Van 04 — exported from device)

```
Totals: OK 0 | Fail 0 | Buf 0 | Thr 0 | Flt 27

summary  ok:0 fail:0 buf:0 thr:0 flt:9  cb:9
summary  ok:0 fail:0 buf:0 thr:0 flt:12 cb:12
summary  ok:0 fail:0 buf:0 thr:0 flt:6  cb:6
```

- 27 GPS callbacks received (`cb`) — the background task IS firing
- 27 filtered (`flt`) — every single fix rejected
- 0 sent (`ok`) — no data reaches the server
- 0 failures (`fail`) — the server is healthy; pings never reach the send step

### Database (Van 01 — additional evidence)

Van 01 sent only 2 pings today then went silent for 16+ minutes while parked at CAAB:

```
device_ts                   | lat          | lng          | seq | speed
2026-03-06 16:03:31.174+00  | -12.9731846  | -38.5028289  | 0   | 0
2026-03-06 16:03:23.363+00  | -12.9731829  | -38.5028307  | 0   | 0
-- 6-hour gap --
2026-03-06 09:52:03.412+00  | -12.9009587  | -38.3259947  |     | 0.08
```

- `seq: 0` on both pings — app was restarted (cold start reset sequence counter)
- `speed: 0` — van is stationary (parked)
- After 2 initial pings, GPS hardware lost fresh lock; all subsequent fixes are stale and filtered
- Compounding factor: stationary suppression (`distance=0` throttles to 1 ping/min) further reduces the window for a valid fix to slip through

### Timeline (Van 01)

| Time (Bahia) | Event                                                  |
|--------------|--------------------------------------------------------|
| 06:52        | Last ping before gap (driving, had fresh GPS)          |
| 13:03        | App restarted — 2 pings sent (GPS briefly fresh)       |
| 13:03+       | All subsequent GPS fixes are stale — 100% filtered     |
| 13:19        | Still stuck, 16 minutes without a single ping          |

---

## Root Cause

Two factors combine to create this failure:

### 1. Stale Fix Guard Too Aggressive After Cold Start (primary)

```ts
// task.ts line 262
if (Date.now() - point.ts > 60_000) {
  logFiltered();
  return;
}
```

After a cold start (manual launch, boot restart, or OS respawn), Android's GPS hardware needs time to acquire satellite lock. Until then, the OS returns cached/last-known locations with old timestamps. The 60-second threshold rejects all of them. Once the guard starts filtering, the app never recovers because no successful send updates `lastSentTime`, so no new GPS fix can break the cycle.

This is especially critical now that boot restart is implemented — on reboot the tracker will auto-start, but if the device is indoors (e.g. parked in a garage), the GPS may take minutes to lock, and every cached fix will be silently discarded.

### 2. All Filters Log Identically — Impossible to Diagnose from Device

```ts
// All three filters call the same function:
logFiltered();  // accuracy
logFiltered();  // duplicate ts
logFiltered();  // stale fix
```

The diagnostic log shows `flt: 27` but there's no way to know which filter triggered. This made the problem invisible until the log was exported and cross-referenced with server-side data.

---

## Proposed Fix

### Fix 1: Relax Stale Fix Threshold After Cold Gap

Use a longer threshold (120s) when the tracker hasn't sent data recently, giving GPS hardware more time to acquire a fresh lock after any type of start (manual, boot restart, OS respawn).

> **Correction (2026-03-06 review):** The original proposal used `lastSentTime === 0` as the cold-start condition. This is **broken** because `lastSentTime` is persisted to AsyncStorage (`@lastSentAt` in `tracking-state.ts`) and restored on every cold start at `task.ts:228`. After the first-ever successful send, `lastSentTime` will never be 0 again — meaning the relaxed threshold would never activate on restarts, reboots, or boot restarts (the exact scenarios causing this bug).
>
> The correct approach is a **gap-based check**: if the last successful send was more than 2 minutes ago, the tracker is effectively in a cold-start scenario regardless of how it was initiated.
>
> Additionally, a **speed guard** is added: a stale cached fix from a moving van could be 1.5km+ off position (60km/h × 90s). Only stationary fixes are safe to accept with the relaxed threshold.

```ts
// task.ts — replace lines 262-265
const age = Date.now() - point.ts;
const isColdGap = (Date.now() - lastSentTime) > 120_000;
const isStationary = point.speed === null || point.speed === 0;
const staleLimit = (isColdGap && isStationary) ? 120_000 : 60_000;
if (age > staleLimit) {
  logFiltered("stale");
  return;
}
```

### Fix 2: Add Filter Reason to Diagnostics

> **Correction (2026-03-06 review):** The original proposal used individual `logEvent("state_change", ...)` calls per filtered fix. This has two problems:
>
> 1. **Log spam:** Each filtered callback generates an `EventEntry`. At ~9 filtered fixes/minute (observed in Van 04), the 1100-entry log (`MAX_LOG_SIZE` in `diag-log.ts`) fills in ~2 hours, pushing out useful diagnostic events (cold_start, errors, flush).
> 2. **Wrong event type:** `"state_change"` is semantically intended for lifecycle transitions and is never used elsewhere in the codebase.
>
> The correct approach is to **extend `MinuteSummary`** with per-reason counters and **extend `logFiltered()`** to accept a reason parameter. This preserves the compact one-row-per-minute format while adding the needed granularity.

Extend `MinuteSummary` in `diag-log.ts`:

```ts
// diag-log.ts — add to MinuteSummary interface
interface MinuteSummary {
  type: "summary";
  t: number;
  ok: number;
  fail: number;
  buf: number;
  thr: number;
  flt: number;         // total filtered (kept for backward compat)
  flt_acc: number;     // filtered: accuracy > 50m
  flt_dup: number;     // filtered: duplicate GPS timestamp
  flt_stale: number;   // filtered: stale fix
  cb: number;
}
```

Extend `logFiltered()`:

```ts
// diag-log.ts — replace logFiltered
type FilterReason = "acc" | "dup" | "stale";

export function logFiltered(reason: FilterReason): void {
  const m = ensureCurrentMinute();
  m.flt++;
  if (reason === "acc") m.flt_acc++;
  else if (reason === "dup") m.flt_dup++;
  else if (reason === "stale") m.flt_stale++;
}
```

Update filter call sites in `task.ts`:

```ts
// Accuracy filter
if (point.accuracy !== null && point.accuracy > ACCURACY_THRESHOLD) {
  logFiltered("acc");
  return;
}

// Duplicate GPS timestamp guard
if (point.ts > 0 && point.ts === lastSentTs) {
  logFiltered("dup");
  return;
}

// Stale fix guard (relaxed after cold gap)
const age = Date.now() - point.ts;
const isColdGap = (Date.now() - lastSentTime) > 120_000;
const isStationary = point.speed === null || point.speed === 0;
const staleLimit = (isColdGap && isStationary) ? 120_000 : 60_000;
if (age > staleLimit) {
  logFiltered("stale");
  return;
}
```

---

## Workaround (Immediate — No Code Change)

Open Google Maps on the affected phone and wait for the blue dot to stabilize (precise location). This forces the GPS hardware to acquire a fresh satellite fix. Then switch back to the tracker app — the next GPS callback will carry a fresh timestamp and pass the stale guard.
