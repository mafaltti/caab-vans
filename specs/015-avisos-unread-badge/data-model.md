# Data Model: Functional Unread Badge for Avisos Tab

**Branch**: `015-avisos-unread-badge` | **Date**: 2026-03-01

## Overview

This feature introduces no database changes. All state is client-side.

## Client-Side State

### localStorage Entry

| Key | Value Type | Example | Description |
|-----|-----------|---------|-------------|
| `avisos_last_seen_at` | ISO 8601 string | `"2026-03-01T14:30:00.000Z"` | Timestamp of the user's last visit to the Avisos tab |

**Lifecycle**:
- **Created**: First time user visits `/avisos` and announcements data loads successfully.
- **Updated**: Every subsequent visit to `/avisos` when announcements data loads.
- **Deleted**: Only if user clears browser storage manually.

### Badge Visibility Logic

```
hasUnread = (lastSeenAt is null AND announcements.length > 0)
         OR (any announcement.createdAt > lastSeenAt)
```

## Existing Entities (unchanged)

### Announcement (database — no changes)

| Field | Type | Used By This Feature |
|-------|------|---------------------|
| `id` | uuid | No |
| `title` | text | No |
| `body` | text | No |
| `is_pinned` | boolean | No |
| `is_urgent` | boolean | No (was used by old badge logic; no longer drives badge) |
| `expires_at` | timestamptz | Indirectly (expired announcements filtered by API) |
| `created_at` | timestamptz | **Yes** — compared against `lastSeenAt` for unread detection |
| `updated_at` | timestamptz | No (edits do not trigger badge per FR-007) |

### AnnouncementResponse (API shape — no changes)

| Field | Type | Used By This Feature |
|-------|------|---------------------|
| `createdAt` | string (ISO 8601) | **Yes** — compared against localStorage timestamp |
| All other fields | — | No changes |
