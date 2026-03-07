# Feature Specification: Remove Dead Sequence Counter

**Feature Branch**: `049-remove-dead-seq-counter`
**Created**: 2026-03-07
**Status**: Draft
**Input**: Finding #4 from tracking system audit (docs/execution/0073-tracking-findings-detailed-report.md) — the sequence counter (`currentSeq`, `resetSequence`, `seq` field) is dead code with no business logic consumers; remove the entire mechanism.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove dead sequence counter from tracker and server (Priority: P1)

As a developer maintaining the tracking system, I want the unused sequence counter mechanism removed so that the codebase is smaller, easier to understand, and free of misleading abstractions that suggest gap detection is functional when it is not.

**Why this priority**: Dead code increases cognitive load for every future contributor touching the tracking pipeline. The `resetSequence()` export implies a reset flow that does not exist, and the server-side gap detection only logs warnings with no recovery — giving a false sense of reliability.

**Independent Test**: After removal, all existing tracking functionality (single ping, batch ping, stop inference, ETA) continues to work identically. The tracker app sends pings without `seq`, and the server accepts them without `seq`.

**Acceptance Scenarios**:

1. **Given** a van-tracker app sending GPS pings, **When** a ping is sent after the removal, **Then** the request body no longer contains a `seq` field and the server accepts it successfully.
2. **Given** a batch of GPS pings sent from the tracker, **When** the batch is processed by the server, **Then** no sequence gap warnings are logged and all pings are stored correctly.
3. **Given** the tracker app restarts (cold start), **When** the background task initializes, **Then** no sequence counter is hydrated from local storage.

---

### User Story 2 - Full cleanup of seq from validator and database (Priority: P1)

As a developer, I want the `seq` field fully removed from the Zod validator and the database column dropped so there is no residual dead code anywhere in the system.

**Why this priority**: Since the tracker update and server deploy ship together, there is no rollout window with mixed client versions. Zod v4 strips unknown keys by default, so old clients sending `seq` will not get validation errors — the field is simply ignored.

**Independent Test**: Send a ping payload with `seq` present and one without `seq` — both must pass validation. The database migration drops the column and index cleanly.

**Acceptance Scenarios**:

1. **Given** a ping payload without a `seq` field, **When** the server validates it, **Then** validation passes and the ping is stored.
2. **Given** a ping payload with a `seq` field (old client), **When** the server validates it, **Then** Zod strips the unknown key and the ping is stored successfully.

---

### Edge Cases

- **Old tracker version still sending `seq`**: Zod v4 strips unknown keys by default, so old clients sending `seq` will not get validation errors — the field is silently ignored. The database column is dropped via migration `00010_drop_seq_column.sql`.
- **AsyncStorage residue on device**: After the tracker app update, the `SEQ_COUNTER` key remains in AsyncStorage but is never read. This is harmless and clears naturally on reinstall.
- **Gap detection log consumers**: If any external log aggregation watches for `[tracking] seq gap` warnings, those log lines will simply stop appearing. No alerting or business logic depends on them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The van-tracker app MUST stop generating, persisting, and sending the `seq` field on GPS pings.
- **FR-002**: The `resetSequence()` function and `currentSeq` module-level state MUST be removed from the tracker app.
- **FR-003**: The tracker API client MUST stop including `seq` in single-ping and batch-ping request bodies.
- **FR-004**: The server single-ping endpoint MUST stop extracting `seq` from the request body and MUST stop logging sequence gap warnings.
- **FR-005**: The server batch-ping endpoint MUST stop storing `seq` in upserted pings. If gap detection logging exists, it MUST also be removed.
- **FR-006**: The server request validator MUST accept ping payloads both with and without a `seq` field. The `seq` field is removed from the Zod schema; Zod v4 strips unknown keys by default, so old clients are not rejected.
- **FR-007**: The `seq` database column and its partial index MUST be dropped via migration (`00010_drop_seq_column.sql`).
- **FR-008**: All existing tracking functionality (ping storage, stop inference, ETA computation, van position updates) MUST continue to work identically after the removal.

### Key Entities

- **GPS Ping**: A location sample from a van tracker device. The `seq` field is removed from the application layer, the Zod validator, and the database column.
- **Van Tracker Background Task**: The background location task that collects and buffers pings. The sequence counter state (`currentSeq`) is removed from this task.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Approximately 80 lines of dead code are removed across 7 files, with zero new replacement logic added.
- **SC-002**: All existing automated tests pass without modification, confirming no behavioral change.
- **SC-003**: The tracker app builds and runs successfully without the sequence counter.
- **SC-004**: The server accepts pings from both old (with `seq`) and new (without `seq`) tracker versions without errors.
- **SC-005**: No sequence-gap warning log lines are emitted by the server after deployment.
