# Deployment Runbook

This is the supported production deployment guide for the current repo state.

## Supported Topology

- Supabase self-host stack from `infra/supabase/`
- Next.js app started with `systemd`
- Caddy as the public reverse proxy and TLS terminator
- Optional OSRM stack from `infra/osrm/`
- Tracker app built with EAS and installed on Android devices

## Prerequisites

- Ubuntu 22.04 or 24.04 VPS with SSH access
- DNS control for three hostnames
- Docker Engine and Docker Compose plugin
- Node.js 22 LTS
- Caddy
- Access to the repo

## Domains

Use placeholders in deploy notes first, then substitute the client values.

| Placeholder | Purpose |
|-------------|---------|
| `APP_DOMAIN` | Public Next.js app |
| `API_DOMAIN` | Supabase gateway |
| `STUDIO_DOMAIN` | Supabase Studio |

Example:

```text
APP_DOMAIN=vans.example.com
API_DOMAIN=api-vans.example.com
STUDIO_DOMAIN=studio-vans.example.com
```

## Secrets and Environment Mapping

The full variable reference lives in [OPERATIONS.md](OPERATIONS.md). The minimum production set is below.

### `infra/supabase/.env`

Set these at minimum:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `API_EXTERNAL_URL=https://API_DOMAIN`
- `SITE_URL=https://APP_DOMAIN`
- `POSTGRES_PORT=5433`
- `STUDIO_PORT=54324`
- `DISABLE_SIGNUP=true`

### Root `.env.local`

Set these before building the app or running scripts:

- `NEXT_PUBLIC_SUPABASE_URL=https://API_DOMAIN`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<same anon key as Supabase>`
- `SUPABASE_SERVICE_ROLE_KEY=<same service role key as Supabase>`
- `DATABASE_URL=postgresql://supabase_admin:<POSTGRES_PASSWORD>@localhost:5433/postgres`
- Optional `OSRM_BASE_URL=http://localhost:5000`
- Optional `OSRM_ROUTE_TIMEOUT_MS=300`
- Optional `OSRM_MATCH_TIMEOUT_MS=200`
- Optional `TRACKING_PROGRESS_SOURCE=legacy`

### One-Time Bootstrap Variables

Use these only when creating the first production superuser:

- `BOOTSTRAP_SUPERUSER_EMAIL`
- `BOOTSTRAP_SUPERUSER_PASSWORD`

## Step 1: Base VPS Setup

Install Docker, Docker Compose plugin, Node.js 22, and Caddy. Open ports `80`, `443`, and `22`.

## Step 2: Deploy the Repo

```bash
git clone <repo-url> /opt/caab-vans
cd /opt/caab-vans
git checkout <target-branch>
npm ci
```

## Step 3: Bring Up Supabase

```bash
cd /opt/caab-vans/infra/supabase
cp .env.example .env
```

Edit `.env` with production secrets and domains, then start the stack:

```bash
docker compose up -d
docker compose ps
```

Recommended port bindings from the checked-in example:

- Kong gateway: `54321`
- Postgres: `5433`
- Studio: `54324`

## Step 4: Configure App Environment

```bash
cd /opt/caab-vans
cp .env.local.example .env.local
```

Fill `.env.local` with the app and script values described above.

## Step 5: Run Migrations

```bash
cd /opt/caab-vans
npm run db:migrate
```

`npm run db:migrate` is the supported migration path. Do not use `npm run db:migrate:docker` for normal deployments.

## Step 6: Bootstrap the First Superuser

Use the explicit bootstrap command in production:

```bash
BOOTSTRAP_SUPERUSER_EMAIL=ops@example.com \
BOOTSTRAP_SUPERUSER_PASSWORD='<strong-password>' \
npm run auth:bootstrap
```

Do not use `npm run db:seed` in production. It is reserved for development convenience/bootstrap work.

## Step 7: Build and Run Next.js via `systemd`

Create a dedicated OS user first if you do not already have one:

```bash
sudo useradd --system --shell /usr/sbin/nologin --home-dir /opt/caab-vans caab
sudo chown -R caab:caab /opt/caab-vans
```

Build the app:

```bash
cd /opt/caab-vans
npm run build
```

Create a service like:

```ini
[Unit]
Description=CAAB Vans Next.js App
After=network.target docker.service

[Service]
Type=simple
User=caab
Group=caab
WorkingDirectory=/opt/caab-vans
EnvironmentFile=/opt/caab-vans/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable caab-vans
sudo systemctl start caab-vans
sudo systemctl status caab-vans
```

## Step 8: Configure Caddy

Use Caddy as the only public entrypoint:

```caddyfile
APP_DOMAIN {
    reverse_proxy localhost:3000
}

API_DOMAIN {
    reverse_proxy localhost:54321
}

STUDIO_DOMAIN {
    basicauth {
        admin <hashed-password>
    }
    reverse_proxy localhost:54324
}
```

Generate the Studio password hash with:

```bash
caddy hash-password --plaintext '<studio-password>'
```

Reload Caddy after updating the config.

## Step 9: Optional OSRM

If you want road snapping and OSRM-based ETA routing:

```bash
cd /opt/caab-vans/infra/osrm
cp .env.example .env
docker compose up -d
```

Then set `OSRM_BASE_URL=http://localhost:5000` in the root `.env.local`.

If you change `OSRM_BASE_URL`, `OSRM_ROUTE_TIMEOUT_MS`, or `OSRM_MATCH_TIMEOUT_MS`, restart the Next.js service so the new process environment is loaded.

## Step 10: Initial Application Bootstrap

After the first superuser is created:

1. Open `https://APP_DOMAIN/admin/login`.
2. Log in with the bootstrap superuser.
3. Create any additional superusers or admins you need.
4. Create driver users.
5. Create vans. Record each van's UUID and ingestion token.
6. Create routes. Each route currently maps one-to-one to a van.
7. Add schedule entries with stop names and times. Add coordinates if you want GPS ETA and stop inference to work.
8. Assign drivers to vans from the van edit screen.

If you later add or edit stop coordinates and want segment fallback ETAs to stay accurate, run:

```bash
cd /opt/caab-vans
npx tsx scripts/precompute-stop-distances.ts
```

## Step 11: Tracker APK Provisioning

Build the tracker app from a workstation, not the VPS:

```bash
cd apps/van-tracker
npm install
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

On the device, configure:

- API Base URL: `https://APP_DOMAIN`
- Van ID: UUID from the admin panel
- Ingestion Token: token generated for that van

The tracker posts to the Next.js app, not directly to `API_DOMAIN`.

## Smoke Checks

Verify these before handoff:

- `https://APP_DOMAIN` loads
- `https://APP_DOMAIN/admin/login` loads
- `https://API_DOMAIN/rest/v1/` responds
- `https://STUDIO_DOMAIN` prompts for basic auth
- Admin login works with the bootstrapped superuser
- You can create a van, route, and schedule entry
- A tracker device can post to `/api/tracking/:vanId`

## Updating an Existing Deploy

For normal application releases:

```bash
cd /opt/caab-vans
git fetch --all
git checkout <target-branch-or-commit>
npm ci
npm run db:migrate
npm run build
sudo systemctl restart caab-vans
```

If you changed `infra/supabase/` or `infra/osrm/`, restart those stacks separately with `docker compose up -d`.

## Rollback

Use the smallest rollback that restores service:

1. If the app release is bad but the database is fine, redeploy the previous app commit and restart the `systemd` service.
2. If a migration introduces a problem, write a forward migration that reverses the change. The migration path is forward-only.
3. If OSRM is unhealthy, unset `OSRM_BASE_URL` and restart the app; ETA falls back automatically.
4. If Caddy routing is broken, restore the prior Caddyfile and reload Caddy.

## Post-Deploy Validation

Run these on the deployed revision where applicable:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Tracker workspace:

```bash
cd apps/van-tracker
npm run check
```
