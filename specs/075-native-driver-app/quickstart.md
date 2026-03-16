# Quickstart: Native Driver App

**Feature Branch**: `075-native-driver-app`

## Prerequisites

- Node.js 18+
- Android Studio with an emulator or physical device
- Supabase instance running (local or remote)
- A driver user in Supabase Auth with `app_metadata.role = "driver"` and `app_metadata.is_active = true`
- A van with `ingestion_token` set and a route assigned to that van
- The driver assigned to the route via `route_drivers`

## Server Setup

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

No new environment variables needed. Existing Supabase env vars are sufficient.

## Expo App Setup

```bash
cd apps/van-tracker

# Install dependencies (includes new @supabase/supabase-js)
npm install

# Start Expo dev server
npx expo start
```

## Testing the Flow

### 1. Device Provisioning
- On first launch, the app shows the Device Setup screen.
- Enter: API Base URL (e.g., `http://10.0.2.2:3000` for Android emulator), Van ID, Ingestion Token.
- Save → app transitions to Login screen.

### 2. Driver Sign-In
- Enter driver email and password.
- Sign in → app validates role and shows route list.

### 3. Start Shift
- Tap a route card → "Start Shift" button.
- Grant location permissions when prompted.
- If cold start (30+ min late): confirm start stop in dialog.
- Tracking begins, active route screen appears.

### 4. Monitor Route
- Active route screen polls every 5 seconds.
- Next stop hero shows name, time, ETA.
- Tracker health shows battery, network, ping freshness.

### 5. Exception Actions
- Open action drawer → Skip stop, Detour, or Navigation.
- Skip requires reason code; "other" requires a note.

### 6. End Shift
- Tap "End Shift" → confirm → server called → tracking stopped.
- Returns to route list.

### 7. Support Area
- Long-press on app version text → support area.
- View/edit device provisioning and diagnostics.

## Key Files to Know

### Server (changes)
| File | Change |
|------|--------|
| `src/lib/api/auth.ts` | Add bearer token support + `requireBoundVan()` |
| `src/lib/supabase/server.ts` | Add bearer token client creation |
| `src/app/api/driver/routes/route.ts` | Add bound-van filtering |
| `src/app/api/driver/routes/[routeId]/route.ts` | Add bound-van rejection |
| `src/app/api/routes/[routeId]/*/route.ts` | Add bound-van rejection (5 files) |

### Expo App (new/changed)
| File | Purpose |
|------|---------|
| `src/lib/supabase-client.ts` | Supabase auth client (NEW) |
| `src/lib/driver-api.ts` | `fetchWithDriverAuth()` helper (NEW) |
| `src/storage/driver-session.ts` | Driver session storage (NEW) |
| `src/storage/shift-state.ts` | Shift state storage (NEW) |
| `src/storage/settings.ts` | Renamed type to DeviceProvisioning (CHANGE) |
| `src/hooks/use-shift-reconciliation.ts` | Server reconciliation hook (NEW) |
| `src/location/tracking.ts` | Decouple permissions from start (CHANGE) |
| `src/storage/device-protected-state.ts` | Add shift state fields (CHANGE) |
| `app/_layout.tsx` | Bootstrap gate + shift-gated recovery (CHANGE) |
| `app/login.tsx` | Driver login screen (NEW) |
| `app/device-setup.tsx` | Refactored from settings.tsx (NEW) |
| `app/(driver)/index.tsx` | Route list screen (NEW) |
| `app/(driver)/routes/[routeId].tsx` | Active route screen (NEW) |
| `app/(driver)/_layout.tsx` | Driver group layout (NEW) |

## Testing

### Server Tests
```bash
npm run test -- --filter auth
npm run test -- --filter driver
```

### Manual Android Testing
1. Provision device → sign in → start shift → view route → skip stop → detour → end shift → log out.
2. Reboot during active shift → verify tracking resumes.
3. Reboot with no shift → verify no tracking.
4. Sign in as wrong driver on wrong van → verify rejection.
