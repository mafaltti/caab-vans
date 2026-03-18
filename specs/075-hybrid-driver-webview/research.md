# Research: 075 Hybrid Driver WebView

**Date**: 2026-03-17
**Branch**: `075-hybrid-driver-webview`

## 1. react-native-webview Compatibility & Patterns

**Decision**: Use `react-native-webview@~13.x` via `npx expo install react-native-webview`.

**Rationale**: The 13.x line is the current stable release (13.16.1 as of Feb 2026), supports both old and new React Native architectures, and is validated by Expo for SDK 55. Using `npx expo install` ensures the correct pinned version.

**Alternatives considered**: None — react-native-webview is the only maintained WebView package for React Native / Expo.

### Key Technical Findings

#### URL filtering (`onShouldStartLoadWithRequest`)
- Works for real HTTP navigations (link clicks, form submissions, redirects).
- Does NOT fire for SPA client-side navigation via `history.pushState` / `history.replaceState` — this is fine since external links are always real navigations.
- `navigationType` property only exists on iOS; do not rely on it for Android.
- Pattern: check if URL starts with the app origin → allow; otherwise → `Linking.openURL` and return `false`.

#### Android back button + WebView history
- Standard pattern: `BackHandler` + `onNavigationStateChange` + `webViewRef.goBack()`.
- **Android SPA caveat**: `onNavigationStateChange` does NOT fire for `pushState`/`replaceState` navigations on Android (iOS has an injected shim, Android does not).
- The Next.js driver pages use `<Link>` and `router.push()` which are SPA navigations — this means `canGoBack` would not update on Android without mitigation.
- **Solution**: Inject a small `history.pushState` / `replaceState` / `popstate` shim via `injectedJavaScript` that posts navigation state changes to native via `window.ReactNativeWebView.postMessage`. This is NOT the "popup/window bridge" the spec prohibits — it is a standard back-navigation tracking pattern.

#### Cookie persistence
- `thirdPartyCookiesEnabled={true}` — needed if API calls go to a different subdomain.
- `domStorageEnabled={true}` — enables localStorage/sessionStorage (default true on Android but best to be explicit).
- `sharedCookiesEnabled` — iOS-only prop, not relevant for the Android-only tracker.

#### Loading and error states
- Lifecycle: `onLoadStart` → `onLoadProgress` → `onLoad` (success) → `onLoadEnd` (always). On error: `onLoadStart` → `onError` → `onLoadEnd`.
- `renderError` prop provides a built-in error replacement view.
- `startInLoadingState` + `renderLoading` handle the initial load indicator.
- For subsequent navigations, use `onNavigationStateChange` with `navState.loading` as a more reliable signal than `onLoadStart`/`onLoadEnd`.

## 2. expo-keep-awake Compatibility & Patterns

**Decision**: Use `expo-keep-awake@~55.0.x` via `npx expo install expo-keep-awake` with the imperative API.

**Rationale**: The `useKeepAwake()` hook keeps the screen on for the component's entire lifetime, including when the app is backgrounded (the root layout never unmounts). The spec requires keep-awake only while foregrounded, so the imperative API (`activateKeepAwakeAsync` / `deactivateKeepAwake`) paired with AppState listeners is correct.

**Alternatives considered**:
- `useKeepAwake()` hook in root layout — rejected because it keeps the screen on even when backgrounded (Android does not auto-release `FLAG_KEEP_SCREEN_ON`).
- `useKeepAwake()` on individual screens — rejected because the spec requires app-wide behavior.

### Key Technical Findings

- No `app.json` plugin required for expo-keep-awake.
- Use a named tag (`"tracker-foreground"`) to avoid collisions.
- Keep-awake is a screen wake lock (`FLAG_KEEP_SCREEN_ON`) — it prevents auto-sleep but does NOT prevent manual screen lock.
- Keep-awake is orthogonal to background location: the foreground service handles GPS independently of screen state.
- Battery impact: screen-on is the single largest drain (~300-600 mW). With GPS + screen on, expect ~4-6 hours on a 4000 mAh battery. The spec accepts this trade-off as a resilience measure.

## 3. Next.js Route Groups for Auth Separation

**Decision**: Use a `(protected)` route group inside `src/app/driver/` to separate the public login page from auth-guarded driver pages.

**Rationale**: Route groups are the idiomatic Next.js App Router pattern for layout-based auth gates. The group name is stripped from URLs, so public URLs remain unchanged.

**Alternatives considered**:
- Separate `/driver-login` route outside `/driver/*` — rejected because it breaks the driver URL namespace convention.
- Middleware-only auth (no layout gate) — rejected because the existing layout provides the driver shell UI (header + logout).

### Key Technical Findings

- Route group names (`(protected)`) are invisible in URLs. `/driver/(protected)/page.tsx` serves `/driver`.
- If no `layout.tsx` exists at `src/app/driver/`, the `(protected)/layout.tsx` applies only to its children. `/driver/login` gets only the root layout — confirmed correct.
- **Conflicting paths warning**: Cannot have both `driver/page.tsx` and `driver/(protected)/page.tsx` — must delete the original after moving.
- All current driver page imports use `@/` aliases (no relative paths) — moving into the route group requires zero import changes.
- Middleware matchers operate on URL paths, not filesystem paths. The existing `"/driver/:path*"` matcher continues to work. Must add `/driver/login` to the login page exception.
- `usePathname()`, `<Link href>`, and `redirect()` all use URL paths — no changes needed anywhere.

## 4. Driver Fetch Helper Strategy

**Decision**: Create a new `fetchWithDriverAuth` function alongside the existing `fetchWithAuth`.

**Rationale**: The spec says to create a driver-specific helper rather than modifying `fetchWithAuth` to accept a redirect parameter. This avoids touching 5 admin call sites.

**Alternatives considered**:
- Parameterize `fetchWithAuth` with a redirect target — rejected per spec (changes every call site).
- Use a factory function — rejected (over-engineering for 2 variants with identical logic minus the redirect URL).

### Scope

3 files need to switch from `fetchWithAuth` to `fetchWithDriverAuth`:
- `src/app/driver/page.tsx` (1 call)
- `src/app/driver/routes/[routeId]/page.tsx` (4 calls)
- `src/components/driver/route-card.tsx` (3 calls)

5 admin files keep using `fetchWithAuth` unchanged.

## 5. Logout Redirect Strategy

**Decision**: Make the logout button redirect context-aware. Driver pages redirect to `/driver/login`; admin pages redirect to `/admin/login`.

**Rationale**: The existing logout button component (`src/components/admin/logout-button.tsx`) hardcodes `window.location.href = "/admin/login"`. The driver layout already renders this component. To support driver logout → `/driver/login`, the component needs to accept a redirect prop or a driver-specific variant is needed.

**Implementation approach**: Add an optional `redirectTo` prop to the existing logout button (defaults to `/admin/login`). The driver `(protected)/layout.tsx` passes `redirectTo="/driver/login"`. This is the minimal change — no new component needed.
