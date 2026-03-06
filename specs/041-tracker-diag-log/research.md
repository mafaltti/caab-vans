# Research: Tracker Diagnostic Log

**Feature**: 041-tracker-diag-log
**Date**: 2026-03-06

## R1: Two-Tier Log Structure (Minute Summaries + Events)

**Decision**: Use a two-tier log — minute-level aggregated summaries for routine activity, individual entries for state changes and errors.

**Rationale**: A full 15-hour shift at one entry per GPS callback (~12/min) would produce ~10,800 entries and ~800KB. Aggregating routine events into per-minute summaries reduces this to ~1,000 entries and ~75KB while preserving all diagnostically useful information. State changes and errors remain as individual entries because their exact timestamps matter.

**Alternatives considered**:
- One entry per GPS callback — too much data for 15h, would require aggressive pruning and lose context.
- Ring buffer with fixed-size slots — harder to implement two types of entries, no clear advantage.
- External logging service (Sentry breadcrumbs) — requires network, not available offline, adds dependency.

## R2: AsyncStorage as Persistence Layer

**Decision**: Use AsyncStorage for log persistence.

**Rationale**: Already a dependency in the tracker app (`@react-native-async-storage/async-storage 2.2.0`). ~75KB is well within AsyncStorage limits. No new dependency needed.

**Alternatives considered**:
- SQLite (expo-sqlite) — overkill for append-only log, adds dependency.
- File system (expo-file-system) — more complex API for simple key-value storage; expo-file-system is only needed for the share/export flow.
- MMKV — faster but adds a new native dependency; AsyncStorage performance is sufficient for ~1 write/minute.

## R3: Share Flow via expo-file-system + expo-sharing

**Decision**: Write log to a temp JSON file, then use `Sharing.shareAsync()` to open the native share sheet.

**Rationale**: Both `expo-file-system` and `expo-sharing` are included in Expo managed workflow (no native module install needed). The native share sheet is familiar to drivers (same as sharing photos/files). JSON format is machine-parseable for future tooling.

**Alternatives considered**:
- Clipboard copy — limited to text, truncation risk on large logs, no file attachment in messaging apps.
- Direct upload to server — requires new API endpoint, uses driver's data, not needed for MVP.
- Email intent — less flexible than native share sheet (drivers prefer WhatsApp/Telegram).

## R4: Flush Strategy

**Decision**: Flush to disk on minute rollover, after error events, and on tracking stop. ~1 write/minute steady state.

**Rationale**: Balances data safety (at most 1 minute of data lost on crash) with performance (no disk I/O in the GPS callback hot path). Error events trigger immediate flush because they're the most diagnostically important entries.

**Alternatives considered**:
- Flush on every entry — unnecessary I/O, could impact GPS callback latency.
- Flush only on stop — too much data loss risk if app crashes.
- Timer-based flush (setInterval) — adds complexity; minute rollover detection is simpler and naturally aligned.

## R5: Diagnostics Screen Navigation

**Decision**: Add a new Expo Router screen at `app/diagnostics.tsx`, accessible from the Settings screen.

**Rationale**: The app uses Expo Router with a Stack navigator. Settings is the natural place for diagnostic tools. Adding a new route file follows existing patterns (`app/index.tsx`, `app/settings.tsx`). The screen must be registered in `app/_layout.tsx`.

**Alternatives considered**:
- Embed in settings screen — too much UI for settings, would clutter the configuration form.
- Bottom tab — only 2 screens currently; adding a tab nav would be a larger refactor and not warranted.
- Modal overlay — less space for timeline view, harder to scroll.

## R6: Dependencies Already Available

**Decision**: No new package installs needed for the core log module. `expo-file-system` and `expo-sharing` need to be verified/added for the share feature.

**Rationale**:
- `@react-native-async-storage/async-storage` — already in package.json
- `expo-file-system` — included in Expo managed workflow, may need explicit install
- `expo-sharing` — included in Expo managed workflow, may need explicit install
- No other dependencies required; the log module is ~100 lines of pure TypeScript.
