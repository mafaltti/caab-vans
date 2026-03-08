# Supabase Features — Usage & Self-Hosting Safety

## QUESTION: Which features of Supabase are we using in this project?

Based on `TECH.md`, the enabled components are: Postgres, Auth, Realtime, Storage, and Studio. Here's what's actually used in code:

| Supabase Feature | Status | Details |
|---|---|---|
| Postgres | Actively used | Core data store — all API routes query via `supabase.from(...)` (17 files) |
| Auth | Actively used | Sign in/out, `getUser`, session management, role-based access (11 files) |
| Realtime | Not used | Zero references to channels, subscriptions, or `postgres_changes` |
| Storage | Not used | Zero references to uploads, downloads, or public URLs |
| Studio | Ops tool | Available for DB admin (not referenced in app code, as expected) |
| Edge Functions | Explicitly banned | Per `TECH.md` — must not be used |
| RPC | Not used | No `supabase.rpc()` calls; all queries use the query builder |

**Summary:** The app relies on Postgres (data) and Auth (authentication/authorization). Realtime and Storage are enabled in the Docker stack but not consumed by the application code yet.

---

## QUESTION: Which features of Supabase is safe to use when selfhosting?

### Fully Stable & Safe

| Feature | Notes |
|---|---|
| Postgres | It's just PostgreSQL — rock solid |
| PostgREST (query builder / `.from()`) | Mature, well-tested REST API layer |
| Auth (GoTrue) | Stable for email/password, JWT, RLS integration. Social OAuth works but requires manual config |
| Studio | Admin UI — works well, just protect it behind auth |
| Realtime (broadcast & presence) | Stable for pub/sub channels |
| Row Level Security | Native Postgres feature — fully reliable |

### Usable but With Caveats

| Feature | Caveat |
|---|---|
| Realtime (`postgres_changes`) | Works, but can be resource-intensive. Requires `wal_level=logical` and proper replication slot management. Slots can pile up if connections drop — monitor them |
| Storage | Functional, but you manage your own S3-compatible backend or local volume. Backup/migration is on you. Image transformations require an extra service (`imgproxy`) |
| Database Webhooks | Work via `pg_net` extension, but debugging is harder without Supabase's managed logging |
| Cron (`pg_cron`) | Works fine — it's a Postgres extension. Just monitor job history |

### Avoid or Use With Caution

| Feature | Why |
|---|---|
| Edge Functions | Already banned in your project. Relies on Deno Deploy infrastructure — self-hosting requires running a separate Deno relay container, limited docs, not well supported |
| Supabase AI/Vectors (`pgvector`) | The extension works, but the AI integrations (embeddings API) are cloud-only |
| Branching / Preview environments | Cloud-only feature |
| Log Explorer / Logflare | Cloud-only; self-host gives you raw Docker logs |
| Supabase CLI remote features | `supabase db push`, `supabase functions deploy` etc. are designed for the hosted platform |

### Practical Advice for This Setup

Given Postgres + Auth are already in use — the two safest choices:

- **Realtime** (if needed for live van tracking on the frontend) — safe for broadcast/presence, just monitor replication slots if using `postgres_changes`
- **Storage** — fine for file uploads (e.g., van photos), but consider whether a simple S3 bucket or static files from the VPS would be simpler (YAGNI)
- **RPC** (`supabase.rpc()`) — just calls Postgres functions, perfectly safe

**Rule of thumb:** anything that's really just Postgres under the hood is safe. Anything that requires Supabase-specific infrastructure gets progressively riskier to self-host.
