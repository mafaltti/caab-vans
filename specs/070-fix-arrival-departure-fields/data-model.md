# Data Model: Fix Arrival/Departure Time Field Usage

**Date**: 2026-03-13

## No Schema Changes

This feature does not modify the database schema. All changes are application-level field reference corrections.

## Semantic Model (Reference)

The following documents the intended semantics of the two time fields, which the fixes align the code to.

### Schedule Entry Time Fields

| Field | Type | Semantic | Used For |
|-------|------|----------|----------|
| `arrival_time` | `time` (HH:mm) | When the van should arrive at a stop | Passenger-facing "next stop" lookup, ETA calculations, delay detection, geofence early arrival window |
| `departure_time` | `time` (HH:mm) | When the van should leave a stop | Schedule window boundaries (start of first stop, end of last stop), time floor filter |

**Constraint**: `departure_time >= arrival_time` (enforced at database level).

**Dwell time** = `departure_time - arrival_time`. When zero, the two fields are interchangeable.

### Derived Concepts

| Concept | Definition |
|---------|------------|
| Route Schedule Window | `[first_stop.departure_time, last_stop.departure_time]` |
| Early Arrival Window | `[stop.arrival_time - 30min, ∞)` — geofence events before this are rejected |
| Next Stop | First stop where `arrival_time >= now` (schedule-based, before tracking overrides) |
| Past Schedule Window | `now > last_stop.departure_time` |
