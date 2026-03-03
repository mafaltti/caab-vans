# Live Tracking — Spec Kit Implementation Plan

Here's how to do this efficiently with Spec Kit:

## Recommended Approach: Two Separate Features, Phased

The live-tracking spec has 6 phases with clear boundaries. I recommend splitting into 2–3 Spec Kit features that map to those phases, not one giant feature:

### Option A: Two Features (Recommended)

| Feature | Scope | Phases from spec |
|---|---|---|
| `016-live-tracking-backend` | DB migration + ingestion endpoint + inference + ETA + public API | Phases 1–3 |
| `017-live-tracking-frontend` | Admin UI (stop coords) + public UI (ETA, passed stops) + embedded map | Phases 4+ |

The Expo app (Phase 5) is built separately — feed `expo-background-geolocation-app.md` to ChatGPT in a different context since it's a standalone React Native project, not Next.js.

### Option B: Three Features (More Granular)

| Feature | Scope |
|---|---|
| `016-tracking-ingestion` | DB migration + tracking endpoint only |
| `017-stop-inference-eta` | Inference module + ETA + public API extension |
| `018-tracking-ui` | Admin + public UI changes |

---

## Workflow per Feature

Run these Spec Kit commands in order:

1. `/speckit.specify` → Creates branch + `spec.md` from your description
2. `/speckit.clarify` → Resolves ambiguities (optional but recommended)
3. `/speckit.plan` → Generates `research.md`, `plan.md`, `quickstart.md`
4. `/speckit.tasks` → Generates `tasks.md` with phases
5. `/speckit.analyze` → Cross-checks consistency (optional)
6. `/speckit.implement` → Executes tasks, runs quality gates, opens PR

## How to Start

For the first feature, run:

```
/speckit.specify
```

And describe it as something like:

> "Live tracking backend: add DB migration for `van_location_pings` + `route_runs` + `route_run_stops` tables, implement `POST /api/tracking/[vanId]` ingestion endpoint, stop inference V1 (simple proximity), ETA computation, and extend `GET /api/routes` with tracking progress. See `docs/android-app+tracking/live-tracking-spec.md` for full details."

Spec Kit will:

1. Create `specs/016-live-tracking-backend/` with the next sequential number
2. Create a feature branch from `dev`
3. Generate `spec.md` with user stories
4. You then proceed through clarify → plan → tasks → implement

## Tips for Efficiency

- **Reference the existing spec docs** in your `/speckit.specify` description — the spec already has the technical decisions locked in, so the specify/clarify phases should be fast.
- **Start with 016 (backend)** — the frontend feature depends on the API existing first.
- **The Expo app is independent** — it only needs the API contract (Phase 1). It can be built in parallel outside Spec Kit since it's a different tech stack (React Native, not Next.js).
- **Don't re-decide architecture in Spec Kit** — point it at `live-tracking-spec.md` as the source of truth. The specify phase should encode those decisions, not re-explore them.

---

> Want me to kick off `/speckit.specify` for the first feature (backend)?
