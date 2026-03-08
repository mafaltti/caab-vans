# Feature Specification: Tracker Boot Restart

**Feature Branch**: `042-tracker-boot-restart`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Auto-restart GPS tracking on device boot after reboot, battery death, or OS update"

## Clarifications

### Session 2026-03-06

- Q: Should boot restart also cover app updates (not just device reboots)? → A: Yes — also auto-resume tracking after app updates by listening for the package-replaced broadcast.
- Q: Should tracking resume before or after the driver unlocks the device? → A: Direct Boot — resume before unlock using device-protected storage for the tracking state flag, ensuring the earliest possible resume even for unattended reboots.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Resume Tracking After Device Reboot or App Update (Priority: P1)

A driver has tracking active and the phone reboots (OS update, battery died and recharged, manual restart) or the app is updated via the Play Store. After the device finishes booting — even before the driver unlocks the screen — the tracker app automatically restarts and resumes GPS tracking without the driver needing to open the app or tap any button.

**Why this priority**: This is the core value of the feature. Without it, a driver whose phone reboots during a route silently stops sending location data, causing a blind spot for passengers and dispatchers until the driver notices and manually reopens the app.

**Independent Test**: Power off a phone with tracking active, power it back on, and verify location pings resume within 90 seconds of boot — without unlocking the device or opening the app.

**Acceptance Scenarios**:

1. **Given** tracking was active before a device reboot, **When** the device finishes early boot (before unlock), **Then** the app auto-starts in the background and resumes sending location pings within 90 seconds.
2. **Given** tracking was active before the battery died, **When** the phone is recharged and powers on, **Then** tracking resumes automatically after boot, before unlock.
3. **Given** tracking was active and the app is updated via the Play Store, **When** the update completes, **Then** tracking resumes automatically without the driver reopening the app.
4. **Given** tracking was NOT active before reboot (driver had stopped tracking), **When** the device boots, **Then** the app does NOT auto-start or send pings.
5. **Given** tracking was active but settings are incomplete (missing van ID or token), **When** the device boots, **Then** the app does NOT attempt to start tracking and logs the reason.

---

### User Story 2 - Persistent Notification After Boot Restart (Priority: P1)

After the app auto-restarts on boot, the driver sees the familiar "CAAB Tracker — Sharing location" notification in the status bar, confirming that tracking is active. This provides visual feedback without requiring the driver to open the app.

**Why this priority**: Without the notification, the driver has no way to know tracking resumed. The notification also keeps the foreground service alive on Android, which is essential for continuous GPS updates.

**Independent Test**: Reboot the device with tracking active and verify the foreground service notification appears in the status bar within 90 seconds.

**Acceptance Scenarios**:

1. **Given** tracking auto-resumes after boot, **When** the foreground service starts, **Then** the persistent notification "CAAB Tracker — Sharing location" appears in the status bar.
2. **Given** tracking auto-resumed after boot, **When** the driver opens the app, **Then** the home screen shows "TRACKING" status and the correct last-sent coordinates.

---

### User Story 3 - Boot Restart Diagnostic Logging (Priority: P2)

When the app auto-restarts after a device boot or app update, the event is recorded in the diagnostic log so that operators or developers can verify boot-restart behavior and troubleshoot issues.

**Why this priority**: Observability is important for a feature that runs without user interaction. Without logging, it would be impossible to confirm whether boot restart worked or diagnose why it failed.

**Independent Test**: Reboot the device with tracking active, then open the Diagnostics screen and verify a "boot_restart" event is logged with a timestamp.

**Acceptance Scenarios**:

1. **Given** the app auto-starts after boot, **When** tracking resumes successfully, **Then** a `boot_restart` event with status "ok" and trigger source ("boot" or "app_update") is logged.
2. **Given** the app auto-starts after boot, **When** tracking fails to resume (e.g., permissions revoked), **Then** a `boot_restart` event with status "error" and reason is logged.

---

### Edge Cases

- What happens if the user revoked location permissions while the phone was off (e.g., via MDM policy push)? The boot restart attempt fails gracefully, logs the error, and does not crash or show error dialogs.
- What happens if the phone reboots in airplane mode or with no network? Tracking still starts (GPS works offline), and pings are buffered until connectivity returns.
- What happens on OEM-restricted devices (Samsung, Xiaomi, Huawei) that aggressively kill background apps? The boot receiver may be blocked by the OEM's battery optimization. This is a documented limitation; drivers are guided to whitelist the app.
- What happens if the phone reboots rapidly in a boot loop? A guard skips boot restart if the last boot restart attempt was less than 60 seconds ago, preventing excessive resource consumption.
- What happens on Android versions below 12? Boot restart works the same way; the foreground service start restriction for background apps does not apply to boot receivers, which receive a system-level trigger window.
- What happens on Android versions below 7.0 (no Direct Boot support)? The boot receiver falls back to listening for the standard boot-completed broadcast (after unlock only).
- What happens if device-protected storage is unavailable or corrupted? The boot receiver treats this as "tracking was not active" and does not attempt to resume. The app-launch auto-resume in the UI layer serves as a fallback.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On device boot, the system MUST check whether tracking was previously active (persisted tracking-enabled flag in device-protected storage) and settings are complete before attempting to resume.
- **FR-002**: If tracking was active and settings are complete, the system MUST start the background location service and foreground notification automatically, without user interaction.
- **FR-003**: The boot-triggered tracking MUST use the same location accuracy settings, throttle logic, and buffer behavior as user-initiated tracking — no separate code path.
- **FR-004**: The system MUST NOT attempt to start tracking on boot if the persisted tracking flag is false or settings are incomplete.
- **FR-005**: The system MUST declare the boot-completed and locked-boot-completed permissions in the app manifest, and listen for the package-replaced broadcast, to receive all relevant restart triggers on Android.
- **FR-006**: The boot restart MUST work on Android 8.0 (API 26) and above, which is the minimum supported version for foreground services.
- **FR-007**: The system MUST log a diagnostic event (`boot_restart`) with success/failure status and trigger source ("boot" or "app_update") when a restart is attempted.
- **FR-008**: The system MUST handle permission revocation gracefully — if location permissions were revoked, the boot restart fails silently (log the error, do not crash or show error dialogs).
- **FR-009**: The system MUST implement a boot-loop guard: skip boot restart if the last boot restart attempt was less than 60 seconds ago.
- **FR-010**: The boot restart MUST restore cold-start state (last coordinates, backoff counters, sequence number) from persistent storage, consistent with the existing cold-start hydration in the background task.
- **FR-011**: The tracking-enabled flag MUST be stored in device-protected storage so it is accessible during Direct Boot (before the user unlocks the device).
- **FR-012**: The system MUST auto-resume tracking after an app update completes, using the same logic as boot restart (check tracking-enabled flag and settings).
- **FR-013**: On devices running Android below 7.0 (no Direct Boot), the system MUST fall back to listening for the standard boot-completed broadcast only (after unlock).

### Key Entities

- **Boot Receiver**: A native Android component that listens for system boot and app-update broadcasts and triggers the app's tracking resume logic. Must be registered as a Direct Boot-aware receiver.
- **Tracking State**: The persisted flag and settings that determine whether boot restart should proceed. The tracking-enabled flag is stored in device-protected storage; other settings remain in credential-protected storage and are accessed after unlock.
- **Config Plugin**: A build-time plugin that injects the native boot receiver into the Android manifest and native source during the build process.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a device reboot with tracking previously active, location pings resume within 90 seconds of boot completion without user intervention — including before the device is unlocked.
- **SC-002**: Zero driver-visible errors or crashes caused by the boot restart feature across all supported Android versions (8.0+).
- **SC-003**: Boot restart events are logged in 100% of boot-triggered restarts, enabling operators to audit and troubleshoot.
- **SC-004**: No increase in battery consumption beyond 2% compared to baseline (user-initiated tracking), measured over a full route run.
- **SC-005**: On devices where OEM restrictions block boot receivers, the existing app-launch auto-resume continues to work as a fallback — no regression.
- **SC-006**: After an app update with tracking previously active, location pings resume within 60 seconds of update completion without user intervention.

## Assumptions

- This feature targets Android only. iOS does not support auto-starting apps on boot; the existing app-launch auto-resume remains the iOS strategy.
- The build workflow supports plugins that can inject native Android code (BroadcastReceiver + manifest entries) during builds.
- The boot-completed permission is a normal permission (auto-granted at install) on Android and does not require runtime user approval.
- OEM battery optimization (Samsung, Xiaomi, Huawei) may prevent the boot receiver from firing. This is documented as a known limitation, not a bug. The existing troubleshooting section will be updated with guidance for drivers.
- The foreground service start exemption for boot-completed receivers applies on Android 12+ (the system grants a brief window to start foreground services from boot receivers).
- Direct Boot (Android 7.0+) allows the boot receiver to fire before the user unlocks the device. The tracking-enabled flag must use device-protected storage to be accessible at this stage. Settings that contain sensitive data (ingestion token) remain in credential-protected storage and are accessed when the full environment becomes available.

## Scope Boundaries

**In scope**:
- Android boot receiver via build-time config plugin (Direct Boot-aware)
- App-update receiver (package-replaced broadcast)
- Auto-resume tracking logic triggered by boot or app-update broadcast
- Device-protected storage for the tracking-enabled flag
- Diagnostic logging for boot restart events (with trigger source)
- Boot-loop protection guard
- Documentation update for OEM restrictions

**Out of scope**:
- iOS boot restart (not supported by the platform)
- Scheduled/periodic restart attempts (e.g., alarm-based fallback)
- UI changes to the tracker app (no new screens or buttons)
- Server-side changes (the API receives pings the same way regardless of how tracking started)

## Dependencies

- Build system must support config plugins that modify the Android manifest and add native source files (supported by current Expo SDK).
- EAS Build is required (config plugins don't work with Expo Go).
- The existing `startTracking()` function and tracking-enabled persistence must remain stable.
- Device-protected storage access requires Android 7.0+ (API 24); fallback to credential-protected storage on older versions.
