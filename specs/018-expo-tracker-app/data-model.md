# Data Model: Expo Van Tracker App

**Date**: 2026-03-01 | **Branch**: `018-expo-tracker-app`

This document describes the local data entities stored on-device via AsyncStorage. There is no local database — all persistence is key-value via AsyncStorage.

## Entities

### 1. Device Settings

Persisted configuration required before tracking can start.

**Storage key**: `@settings`

| Field           | Type     | Required | Validation                     |
|-----------------|----------|----------|--------------------------------|
| `apiBaseUrl`    | `string` | Yes      | Non-empty, valid URL format    |
| `vanId`         | `string` | Yes      | Valid UUID v4 format           |
| `ingestionToken`| `string` | Yes      | Non-empty                      |

**Lifecycle**: Written on Settings screen save. Read on Home screen load and before each tracking start. Never expires.

### 2. Device Identity

Unique device identifier for diagnostic/audit purposes.

**Storage key**: `@deviceId`

| Field      | Type     | Description                              |
|------------|----------|------------------------------------------|
| `deviceId` | `string` | UUID v4, generated once via `expo-crypto` |

**Lifecycle**: Generated on first app launch if not present. Never changes. Included in every POST body.

### 3. Tracking State

Persisted flag to support auto-resume on app restart.

**Storage key**: `@trackingEnabled`

| Field             | Type      | Description                        |
|-------------------|-----------|------------------------------------|
| `trackingEnabled` | `boolean` | `true` if tracking was active      |

**Storage key**: `@lastSentAt`

| Field        | Type     | Description                              |
|--------------|----------|------------------------------------------|
| `lastSentAt` | `number` | Unix milliseconds of last successful send |

**Lifecycle**: Updated on each successful send and on start/stop. Read on app launch to determine auto-resume.

### 4. Offline Buffer

FIFO queue of unsent location points.

**Storage key**: `@locationBuffer`

| Field  | Type              | Description                    |
|--------|-------------------|--------------------------------|
| buffer | `LocationPoint[]` | Array of unsent points (max 50)|

Each `LocationPoint`:

| Field      | Type             | Description                       |
|------------|------------------|-----------------------------------|
| `lat`      | `number`         | Latitude (WGS84)                  |
| `lng`      | `number`         | Longitude (WGS84)                 |
| `accuracy` | `number | null`  | Horizontal accuracy in meters     |
| `speed`    | `number | null`  | Speed in m/s                      |
| `heading`  | `number | null`  | Heading in degrees (0–360)        |
| `ts`       | `number`         | Unix milliseconds (UTC) at capture|

**Lifecycle**: Points are appended when network send fails. Oldest removed when buffer exceeds 50. Flushed oldest-first when connectivity returns. Persisted to survive app restarts.

## State Transitions

### Tracking Session State Machine

```
[OFF] ---(Start pressed + settings valid + permissions granted)---> [ACTIVE]
[ACTIVE] ---(Stop pressed)---> [OFF]
[ACTIVE] ---(App killed)---> [OFF] (flag remains true in storage)
[OFF] ---(App launch + flag true + settings valid)---> [ACTIVE] (auto-resume)
```

### Location Point Flow

```
[GPS Update] --> [Accuracy check: > 50m?]
                      |                 |
                    (drop)         [Throttle check: >= 5m OR >= 3s?]
                                       |                    |
                                   (skip)              [Build point]
                                                            |
                                                 [Network available?]
                                                  |                |
                                           [Flush buffer     [Add to buffer]
                                            + send point]
                                                  |
                                           [Success?]
                                            |        |
                                        (remove    (keep in
                                         from       buffer)
                                         buffer)
```

## Storage Size Estimates

- Settings: ~200 bytes
- Device ID: ~40 bytes
- Tracking state: ~30 bytes
- Buffer (50 points max): ~50 * ~100 bytes = ~5 KB
- **Total max**: ~6 KB — well within AsyncStorage limits
