# Component Interfaces: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28

## Summary

This document defines the prop interfaces for new and updated public-facing components. These serve as contracts between the page layer and the component layer.

---

## New Components

### HeroCard

Replaces `NextStopDisplay` + `LocationLinkCta` with a single gradient card.

```typescript
interface HeroCardProps {
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
  locationUrl: string | null;
  locationUpdatedAt: string | null;
  isLocationOutdated: boolean;
  isRunning: boolean;
}
```

**Rendering rules**:
- If `nextStop` exists: gradient card with stop name, time, location button (if `isRunning && locationUrl`)
- If `scheduleStatus === "ended"`: muted card with "Programação encerrada" message
- If no schedule: muted card with "Nenhum horário disponível"
- Outdated location: warning indicator near timestamp

---

### ScheduleTimeline

Replaces `ScheduleList` with a vertical timeline visualization.

```typescript
interface ScheduleTimelineProps {
  schedule: Array<{ id: string; stopName: string; time: string }>;
  nextStopId: string | null;
}
```

**Rendering rules**:
- Derives `TimelineStop[]` with `past`/`current`/`future` status from `schedule` + `nextStopId`
- Past stops collapsed by default (expandable)
- Current stop: pulsing node + bold text
- Future stops: empty circle nodes

---

### PageTransition

Animation wrapper for page content transitions.

```typescript
interface PageTransitionProps {
  children: React.ReactNode;
  variant?: "fade-slide-up" | "slide-from-right";
}
```

**Rendering rules**:
- Wraps children in `motion.div` with enter/exit animations
- Respects `prefers-reduced-motion` media query
- `fade-slide-up`: default for list pages (routes, announcements)
- `slide-from-right`: for route detail drill-in

---

## Updated Components

### RouteCard (rewrite)

```typescript
interface RouteCardProps {
  route: RouteWithStatus; // includes new totalStops, currentStopIndex
}
```

**Changes from current**:
- Adds Bus icon with status-colored background
- Adds progress text ("Parada X de Y")
- Adds inner card section with MapPin + Clock icons for next stop
- Adds scale-on-tap animation
- Adds hover shadow elevation + chevron color shift

---

### RouteStatusBadge (update)

```typescript
interface RouteStatusBadgeProps {
  isRunning: boolean;
}
```

**Changes from current**:
- Active badge: emerald background with pulsing dot indicator
- Inactive badge: zinc background, no animation
- Props unchanged, only visual styling changes

---

### BottomNav (rewrite)

```typescript
// No props — uses usePathname() and useAnnouncements() internally
```

**Changes from current**:
- Active tab: highlighted icon container (bg tint) + bolder icon stroke + distinct color
- Notification dot on Avisos tab (derived from `useAnnouncements()`)
- Upward shadow on nav bar
- Smaller label text with tracking

---

### AnnouncementCard (rewrite)

```typescript
interface AnnouncementCardProps {
  announcement: AnnouncementResponse;
}
```

**Changes from current**:
- Adds uppercase type badge ("URGENTE" / "INFORMATIVO") with icon
- Urgent cards: rose accent bar on left, rose color scheme
- Info cards: neutral color scheme with info badge
- Pinned: pin icon indicator
- Props unchanged, only visual rendering changes

---

## Removed Components

| Component          | Replacement                | Reason                                    |
|--------------------|----------------------------|-------------------------------------------|
| `NextStopDisplay`  | `HeroCard`                 | Merged with location CTA into gradient card |
| `LocationLinkCta`  | `HeroCard`                 | Location button now lives inside hero card |
| `ScheduleList`     | `ScheduleTimeline`         | Flat list replaced by vertical timeline    |
