# Feature Specification: Live Tracking Ingestion

**Feature Branch**: `016-live-tracking-ingestion`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Live tracking ingestion: add database migration creating van_location_pings table, route_runs table, route_run_stops table, geofence columns on schedule_entries, and latest-location columns on vans. Implement POST /api/tracking/[vanId] endpoint with x-ingestion-token auth, Zod validation, rate limit at 25 req/min, insert into van_location_pings, and update vans latest fields + location_updated_at. Enable RLS on new tables with no anon policies. Follow existing patterns from src/app/api/ingest/[vanId]/route.ts. See docs/android-app+tracking/live-tracking-spec.md sections A and B for full details."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver App Sends Location Pings (Priority: P1)

A van driver's mobile tracker app continuously sends GPS location pings to the backend while operating a route. The system receives, validates, and stores each ping, keeping the van's latest known position up to date. This is the foundational data pipeline that all downstream tracking features (stop inference, ETA, live map) depend on.

**Why this priority**: Without location ingestion, no live tracking features can function. This is the data entry point for the entire tracking system.

**Independent Test**: Can be fully tested by sending HTTP requests to the tracking endpoint and verifying data is stored correctly — delivers the ability to record van positions in real time.

**Acceptance Scenarios**:

1. **Given** a registered van with a valid ingestion token, **When** the tracker app sends a well-formed location ping with lat/lng/accuracy/speed/heading/timestamp, **Then** the system stores the ping in location history, updates the van's latest position fields and last-updated timestamp, and returns a success acknowledgment.
2. **Given** a registered van, **When** the tracker app sends a ping with an invalid or missing ingestion token, **Then** the system rejects the request with an unauthorized error and stores nothing.
3. **Given** a registered van, **When** the tracker app sends a ping with invalid data (e.g., latitude out of range, missing required fields), **Then** the system rejects the request with a validation error and stores nothing.
4. **Given** a van ID that does not exist, **When** a ping is sent, **Then** the system returns a not-found error.

---

### User Story 2 - Rate Limiting Protects the System (Priority: P1)

The system limits the number of location pings accepted per van to prevent abuse, accidental flooding, or runaway clients from overwhelming the backend. Normal operation (~20 pings/minute at 3-second intervals) is well within limits; only abnormal bursts are throttled.

**Why this priority**: Without rate limiting, a misbehaving client could degrade performance for all users. This is a safety-critical requirement that ships alongside ingestion.

**Independent Test**: Can be tested by sending rapid bursts of requests and verifying that excess requests are rejected with appropriate rate-limit responses.

**Acceptance Scenarios**:

1. **Given** a van sending pings at a normal rate (1 every 3 seconds), **When** 20 pings arrive in a minute, **Then** all pings are accepted.
2. **Given** a van sending pings in a burst, **When** more than 25 pings arrive within a 1-minute window, **Then** excess pings are rejected with a rate-limit error.
3. **Given** a rate-limited van, **When** the 1-minute window elapses, **Then** subsequent pings are accepted again.

---

### User Story 3 - Database Supports Tracking Data Model (Priority: P1)

The system's data storage is extended to support: (a) a history of all location pings per van, (b) daily route run records to track a van's progress through its scheduled stops, (c) per-stop status within a run (pending/passed), and (d) geofence coordinates on scheduled stops to enable future proximity detection. The van record is also extended to hold the latest GPS position fields.

**Why this priority**: The data model is the structural foundation — ingestion and all future inference features depend on these tables and columns existing.

**Independent Test**: Can be tested by running the migration against a fresh database and verifying all tables, columns, constraints, and indexes are created correctly.

**Acceptance Scenarios**:

1. **Given** the existing database schema, **When** the migration runs, **Then** a location ping history table is created with columns for van reference, device ID, coordinates, accuracy, speed, heading, device timestamp, and server receive time.
2. **Given** the existing database schema, **When** the migration runs, **Then** a route runs table is created with route reference, service date, and a unique constraint on (route, date).
3. **Given** the existing database schema, **When** the migration runs, **Then** a route run stops table is created with run reference, schedule entry reference, status (pending/passed), and passed-at timestamp.
4. **Given** the existing schedule entries table, **When** the migration runs, **Then** nullable latitude and longitude columns and a geofence radius column (defaulting to 50 meters) are added.
5. **Given** the existing vans table, **When** the migration runs, **Then** nullable columns for last latitude, longitude, accuracy, speed, and heading are added.
6. **Given** the new tables, **When** the migration runs, **Then** Row Level Security is enabled on all new tables with no anonymous access policies (all access goes through the server-side service role).

---

### User Story 4 - Stale Timestamps Are Handled Gracefully (Priority: P2)

When a tracker app has been offline and flushes buffered pings, some may carry device timestamps significantly in the past or (due to clock skew) in the future. The system handles these gracefully — future timestamps beyond a reasonable threshold are capped, while past timestamps are accepted as-is since they represent valid historical data.

**Why this priority**: Offline buffering is a real scenario for mobile trackers. Timestamp handling ensures data quality without rejecting valid delayed pings.

**Independent Test**: Can be tested by sending pings with various timestamp values (current, past, far-future) and verifying correct storage behavior.

**Acceptance Scenarios**:

1. **Given** a ping with a device timestamp from 30 minutes ago, **When** submitted, **Then** the ping is accepted and stored with the original device timestamp.
2. **Given** a ping with a device timestamp more than 24 hours in the future, **When** submitted, **Then** the ping is accepted but the device timestamp is capped to the current server time.
3. **Given** a ping with a device timestamp 5 minutes in the future (minor clock skew), **When** submitted, **Then** the ping is accepted with the original device timestamp.

---

### Edge Cases

- What happens when the same van sends two pings with identical timestamps? Both are stored — each ping is an independent record with its own ID.
- What happens when a van's ingestion token is rotated while the tracker app is running? The next ping from the old token is rejected with an unauthorized error; the app must be reconfigured with the new token.
- What happens when the request body is not valid JSON? The system returns a validation error.
- What happens when a `vanId` in the URL is not a valid UUID format? The system returns a not-found or validation error.
- What happens when the database is temporarily unavailable? The system returns a server error; the tracker app's offline buffer retains the ping for retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept location pings via a dedicated tracking endpoint, authenticating each request with the van's ingestion token.
- **FR-002**: System MUST validate all incoming ping data — latitude (-90 to 90), longitude (-180 to 180), non-negative accuracy and speed, heading (0-360), positive integer timestamp, and valid UUID device ID.
- **FR-003**: System MUST store every accepted ping in a location history table, recording van ID, device ID, coordinates, accuracy, speed, heading, device timestamp, and server receive time.
- **FR-004**: System MUST update the van's latest position fields (lat, lng, accuracy, speed, heading) and last-updated timestamp on each accepted ping.
- **FR-005**: System MUST enforce a rate limit of 25 requests per minute per van, rejecting excess requests with a rate-limit error.
- **FR-006**: System MUST cap device timestamps that are more than 24 hours in the future to the current server time.
- **FR-007**: System MUST create database tables for location ping history, daily route runs, and per-stop run status, with appropriate foreign keys, indexes, and constraints.
- **FR-008**: System MUST add geofence coordinate columns (latitude, longitude, radius) to scheduled stops for future proximity detection use.
- **FR-009**: System MUST enable Row Level Security on all new tables with no anonymous access policies.
- **FR-010**: System MUST return structured error responses (error code + message) for all failure cases: unauthorized, not found, validation error, rate limited.

### Key Entities

- **Van Location Ping**: A single GPS reading from a tracker device — includes van reference, device ID, coordinates (lat/lng), accuracy, speed, heading, device timestamp, and server receive time.
- **Route Run**: Represents one day's execution of a route — links to the route and a specific service date. Unique per route per day.
- **Route Run Stop**: Tracks whether a specific scheduled stop has been passed during a route run — status is either "pending" or "passed", with an optional passed-at timestamp.
- **Van (extended)**: Existing van entity extended with latest GPS position fields (lat, lng, accuracy, speed, heading) to support quick lookups without querying ping history.
- **Schedule Entry (extended)**: Existing schedule entry extended with optional geofence coordinates (lat, lng) and radius for proximity-based stop detection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Location pings from the tracker app are accepted and stored within 500 milliseconds under normal load.
- **SC-002**: The system sustains 25 pings per minute per van without errors, supporting at least 10 concurrently tracked vans.
- **SC-003**: 100% of pings with invalid data (bad coordinates, missing fields, wrong token) are rejected with appropriate error responses — no invalid data enters the database.
- **SC-004**: The van's latest position is queryable immediately after a ping is accepted, enabling downstream features to read current location.
- **SC-005**: The database migration runs cleanly on the existing schema without data loss or downtime.
- **SC-006**: All new tables enforce row-level security, ensuring no anonymous/public access to tracking data.

## Assumptions

- The existing `vans.ingestion_token` field is used for authentication — no new auth mechanism is needed.
- The existing `location_updated_at` column on `vans` is reused for the latest ping timestamp — no new timestamp column is added.
- The `set_updated_at()` trigger function from the initial migration is available for reuse on the `route_runs` table.
- The tracker app (Expo) sends pings in the exact JSON format defined in the live tracking spec's API contract.
- Stop inference (marking stops as passed) is a separate feature that will be built on top of this data model in a subsequent phase — this spec covers only the data model and ingestion pipeline.
- Data retention cleanup (deleting old pings) is an operational concern handled separately.

## Scope Boundaries

**In scope:**
- Database migration with all tables and columns defined in the live tracking spec section A
- POST /api/tracking/[vanId] endpoint as defined in section B
- Zod validation schema for tracking pings
- Rate limiting at 25 req/min per van
- RLS on new tables

**Out of scope:**
- Stop inference / proximity detection logic (Phase 2)
- ETA computation (Phase 2)
- Public API extensions for progress data (Phase 3)
- Admin UI for stop coordinates (Phase 4)
- Public UI changes for ETA display (Phase 4)
- Expo tracker mobile app (Phase 5, parallel)
- Data retention / cleanup jobs (Phase 6)
