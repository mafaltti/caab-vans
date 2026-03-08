# Data Model: Hide Idle Status from Passenger UI

No data model changes required for this feature.

## Existing Entities (unchanged)

- **RunStatus**: Union type `"waiting" | "in_progress" | "idle" | "completed"` — remains unchanged in the backend and type definitions. The `"idle"` value continues to exist; it is simply no longer rendered distinctly in passenger-facing components.

## Notes

- The `RunStatus` type is not modified. The `"idle"` variant is still used by the driver UI (`src/components/driver/route-card.tsx`) and returned by API endpoints.
- No database, API, or type-level changes needed.
