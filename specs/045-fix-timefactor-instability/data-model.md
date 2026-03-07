# Data Model: Fix timeFactor Instability

## No Schema Changes Required

This fix modifies computation logic only. No database tables, columns, or relationships are added, removed, or modified.

## Affected Entities (Computation Only)

### RecentRun (in-memory only)

**Current definition** (`src/lib/tracking/time-factors.ts`):

```
interface RecentRun {
  actualMinutes: number;     // Time between consecutive stop passages
  predictedMinutes: number;  // Baseline prediction for the same segment
}
```

**Change**: `predictedMinutes` will be computed using a fixed reference speed constant instead of instantaneous GPS speed. The interface itself does not change.

### New Constants

| Constant             | Value | Location                          | Purpose                                      |
|----------------------|-------|-----------------------------------|----------------------------------------------|
| REFERENCE_SPEED_MPS  | 8.3   | src/lib/tracking/time-factors.ts  | Fixed baseline for recentRuns predictions     |
| MIN_SEGMENT_DIST_M   | 100   | src/lib/tracking/time-factors.ts  | Filter out unreliable short-distance segments |
| MIN_SEGMENT_TIME_MIN | 0.5   | src/lib/tracking/time-factors.ts  | Filter out unreliable short-time segments     |

### New Function

| Function          | Location                         | Purpose                                                  |
|-------------------|----------------------------------|----------------------------------------------------------|
| buildRecentRuns() | src/lib/tracking/time-factors.ts | Extract duplicated recentRuns loop from both route files  |
