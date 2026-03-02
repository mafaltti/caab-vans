# Data Model: Faster Polling Intervals

**Feature**: 028-faster-polling
**Date**: 2026-03-02

## Summary

No data model changes. This feature modifies client-side polling configuration only — no database schema, API contract, or server-side logic changes required.

## Affected Configuration (Client-Side Only)

### QueryClient Default Options

| Property | Type | Before | After |
|----------|------|--------|-------|
| `staleTime` | number (ms) | 30,000 | 10,000 |
| `refetchOnWindowFocus` | boolean | false | true |

### Query Hook Options

| Hook | Property | Type | Before | After |
|------|----------|------|--------|-------|
| `useRoutes` | `refetchInterval` | number (ms) | 60,000 | 15,000 |
| `useRouteDetail` | `refetchInterval` | number (ms) | 30,000 | 15,000 |
| `useAnnouncements` | `refetchInterval` | number (ms) | 60,000 | 60,000 (unchanged) |
