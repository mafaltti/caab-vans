# Tasks: Van-Scoped Driver Panel

**Input**: Design documents from `/specs/079-van-scoped-driver-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: US1 (van-scoped filtering) and US2 (backward compatibility) are delivered by the same code changes — the `vanId` parameter is optional, so both stories are satisfied simultaneously. They share a single implementation phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup required — all changes modify existing files in an existing project structure. No new dependencies, no schema changes.

*Skipped — nothing to do.*

---

## Phase 2: Foundational

**Purpose**: No foundational work required — existing API route, hook, page, and tracker already exist. Authentication, routing, and Supabase client are already in place.

*Skipped — nothing to do.*

---

## Phase 3: User Story 1+2 — Van-Scoped Filtering with Backward Compatibility (Priority: P1) MVP

**Goal**: When a driver opens the panel from a specific van's tracker, show only that van's route. When opened without van context, show all assigned routes (current behavior preserved).

**Independent Test**:
- `GET /api/driver/routes` (no vanId) returns all assigned routes (US2)
- `GET /api/driver/routes?vanId=<valid-uuid>` returns only that van's route (US1)
- `GET /api/driver/routes?vanId=<invalid-uuid>` returns empty routes (US1 edge case)
- Tracker WebView URL includes `?vanId=...` (US1 end-to-end)

### Implementation

- [x] T001 [P] [US1] Add optional `vanId` query parameter filter to GET handler in `src/app/api/driver/routes/route.ts` — import `NextRequest`, change signature to `GET(request: NextRequest)`, read `vanId` from `request.nextUrl.searchParams.get("vanId")`, conditionally add `.eq("van_id", vanId)` to the routes query when `vanId` is truthy
- [x] T002 [P] [US1] Accept optional `vanId` parameter in `src/lib/queries/use-driver-routes.ts` — add `vanId?: string | null` parameter to `useDriverRoutes`, update `queryKey` to `["driver-routes", vanId ?? null]`, append `?vanId=${vanId}` to fetch URL when `vanId` is truthy
- [x] T003 [US1] Read `vanId` from URL and pass to hook in `src/app/driver/(protected)/page.tsx` — import `Suspense` and `useSearchParams`, extract page body into `DriverPageContent` component, wrap in `<Suspense>`, read `vanId` via `useSearchParams().get("vanId")`, pass to `useDriverRoutes(vanId)`, update `queryClient.setQueryData` key to `["driver-routes", vanId ?? null]`
- [x] T004 [US1] Pass `vanId` from settings to WebView URL in `apps/van-tracker/app/driver.tsx` — add `useState` for `vanId` populated from `getSettings()` alongside `baseUrl`, change WebView source from `` `${baseUrl}/driver` `` to `` `${baseUrl}/driver?vanId=${vanId}` ``

**Checkpoint**: All 4 files modified. Van-scoped filtering active end-to-end. Backward compatibility preserved (omitting `vanId` returns all routes).

---

## Phase 4: Quality Gates

**Purpose**: Verify no regressions before PR

- [x] T005 Run type-check (`npx tsc --noEmit`), lint (`npx eslint .`), and build (`npx next build`) to verify zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 3 (US1+US2)**: No setup or foundational dependencies — can start immediately
- **Phase 4 (Quality Gates)**: Depends on Phase 3 completion

### Task Dependencies

- **T001**: Independent — can start immediately
- **T002**: Independent — can start immediately
- **T003**: Depends on T002 (calls `useDriverRoutes(vanId)` which T002 modifies)
- **T004**: Independent of T001-T003 (tracker app is a separate codebase)
- **T005**: Depends on T001-T003 (quality gates on web app; T004 is Expo, not Next.js)

### Parallel Opportunities

- **T001 + T002**: Different files, no shared dependencies — run in parallel
- **T004**: Independent of all web tasks — can run in parallel with any task
- **T003**: Must wait for T002

---

## Parallel Example

```bash
# Wave 1 — run in parallel:
Task: "T001 - Add vanId filter to API route in src/app/api/driver/routes/route.ts"
Task: "T002 - Accept vanId parameter in src/lib/queries/use-driver-routes.ts"
Task: "T004 - Pass vanId in WebView URL in apps/van-tracker/app/driver.tsx"

# Wave 2 — after T002 completes:
Task: "T003 - Read vanId from URL in src/app/driver/(protected)/page.tsx"

# Wave 3 — after T001-T003 complete:
Task: "T005 - Run type-check, lint, and build"
```

---

## Implementation Strategy

### MVP (Single Deployment)

1. Complete T001 + T002 + T004 in parallel (Wave 1)
2. Complete T003 (Wave 2)
3. Run T005 quality gates (Wave 3)
4. **VALIDATE**: Test all verification scenarios from quickstart.md
5. Create PR targeting `dev`

This feature is small enough to deliver as a single atomic PR. Each step is independently deployable (the API and hook changes are backward-compatible even without the page or tracker changes), but a single PR is the simplest approach.

---

## Notes

- All 4 implementation tasks modify existing files — no new files created
- T004 (tracker app) uses Expo/React Native, not Next.js — it won't be covered by `next build` or `tsc --noEmit` from the web project root
- The `vanId` parameter is optional everywhere — backward compatibility is inherent in the implementation, not a separate concern
- Commit after each task or logical group (T001+T002 together, T003, T004)
