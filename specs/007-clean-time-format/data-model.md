# Data Model: Clean Time Format

## No Changes Required

This feature does not modify any data entities, database schema, or stored data.

### Existing Entity (unchanged)

**schedule_entries**
- `id`: uuid (PK)
- `route_id`: uuid (FK → routes)
- `stop_name`: text
- `time`: PostgreSQL `time` type — stored as `HH:MM:SS`, displayed as `HH:MM`
- `created_at`: timestamptz

The `time` column remains as PostgreSQL `time` type. The formatting change is applied at the API response layer only.
