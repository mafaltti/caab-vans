# Quickstart: Mobile Responsiveness & Secure Logout

**Branch**: `002-responsive-logout-fix` | **Date**: 2026-02-27

## Prerequisites

- Node.js (see `.nvmrc` or `package.json` engines)
- Running Supabase instance (local or remote) with env vars configured
- A seeded admin user account

## Setup

```bash
git checkout 002-responsive-logout-fix
npm install
cp .env.example .env.local  # if not already configured
```

## Development

```bash
npm run dev
```

## Key Files to Modify

### Logout Flow (Priority P1)
| File | Change |
|------|--------|
| `src/app/api/admin/auth/logout/route.ts` | **New** — server-side logout endpoint |
| `src/components/admin/logout-button.tsx` | Call logout API, add error handling + loading state |
| `src/middleware.ts` | Add `Cache-Control: no-store` header to all admin responses |
| `src/lib/api/fetch-with-auth.ts` | **New** — shared fetch wrapper with 401 redirect |

### Responsive Tables (Priority P2)
| File | Change |
|------|--------|
| `src/app/admin/vans/page.tsx` | Hide secondary columns on mobile |
| `src/app/admin/routes/page.tsx` | Hide secondary columns on mobile |
| `src/app/admin/announcements/page.tsx` | Hide secondary columns on mobile |
| `src/app/admin/users/page.tsx` | Hide secondary columns on mobile |

### Schedule Editor (Priority P3)
| File | Change |
|------|--------|
| `src/components/admin/schedule-editor.tsx` | Responsive time input widths + flex-wrap |

## Testing

### Manual Logout Tests
1. Log in as admin → navigate to several admin pages
2. Click "Sair" → verify redirect to login page
3. Press browser back button → verify login page shown (not cached admin page)
4. Paste an admin URL directly → verify redirect to login
5. Disconnect network → click "Sair" → verify error message shown

### Manual Responsive Tests
1. Open browser DevTools → toggle device toolbar
2. Set viewport to 375px width (iPhone SE)
3. Visit each admin list page → verify no horizontal scroll
4. Visit schedule editor → verify no overflow
5. Set viewport to 768px → verify additional columns appear

## Quality Gates

```bash
npx eslint . --ext .ts,.tsx
npx tsc --noEmit
npm run build
npx vitest run
```
