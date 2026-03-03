# VPS Deployment Guide — CAAB Vans (Full Stack)

## Prerequisites

- Fresh Ubuntu 22.04/24.04 VPS with SSH access
- A domain/subdomain with DNS A records pointing to the VPS IP (3 subdomains needed)
- The repo code (you'll clone it on the VPS)

## Domains you'll need

| Subdomain | Points to |
|---|---|
| `YOUR_APP_DOMAIN` | Next.js web portal (public) |
| `YOUR_API_DOMAIN` | Supabase API gateway (used by van-tracker + web) |
| `YOUR_STUDIO_DOMAIN` | Supabase Studio (protected, admin only) |

**Example:** `vans.example.com`, `api-vans.example.com`, `studio-vans.example.com`

---

## Step 1 — VPS Base Setup

SSH into your VPS and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Install Node.js 22 (for building Next.js)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install Caddy (reverse proxy + auto TLS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Log out and back in for docker group to take effect
exit
```

---

## Step 2 — Clone the Repo

```bash
ssh your-vps

# Clone the repo
git clone https://github.com/mafaltti/caab-vans.git /opt/caab-vans
cd /opt/caab-vans
git checkout dev
```

---

## Step 3 — Configure & Start Supabase

```bash
cd /opt/caab-vans/infra/supabase

# Copy env template
cp .env.example .env
```

Edit `.env` with production values:

```bash
nano .env
```

```env
# ---- CHANGE THESE ----
POSTGRES_PASSWORD=<generate-a-strong-password>
JWT_SECRET=<generate-with: openssl rand -base64 32>

# Keep the existing ANON_KEY and SERVICE_ROLE_KEY from .env.example
# OR generate new ones matching the new JWT_SECRET
# (if you change JWT_SECRET, you MUST regenerate both keys)

# ---- Update URLs to your domains ----
API_EXTERNAL_URL=https://YOUR_API_DOMAIN
SITE_URL=https://YOUR_APP_DOMAIN

# ---- Ports (keep internal, Caddy handles public access) ----
POSTGRES_PORT=5433
KONG_HTTP_PORT=54321
STUDIO_PORT=54324
PGRST_PORT=3001
GOTRUE_PORT=9999

DISABLE_SIGNUP=true
```

> **Important:** If you keep the existing `JWT_SECRET` from the repo's `.env`, the existing `ANON_KEY` and `SERVICE_ROLE_KEY` will continue to work. If you change `JWT_SECRET`, you need to regenerate both keys.

Start Supabase:

```bash
docker compose up -d

# Verify all services are healthy
docker compose ps
```

---

## Step 4 — Run Migrations & Seed

```bash
cd /opt/caab-vans

# Install dependencies
npm install

# Create .env.local for the Next.js app
cp .env.local.example .env.local
nano .env.local
```

Set `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_API_DOMAIN
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same-anon-key-from-supabase-.env>
SUPABASE_SERVICE_ROLE_KEY=<same-service-role-key-from-supabase-.env>
DATABASE_URL=postgresql://supabase_admin:<your-postgres-password>@localhost:5433/postgres
```

Run migrations and seed:

```bash
# Apply all migrations
npm run db:migrate

# Create the superuser (admin@caab.org.br / caab2026!)
npm run db:seed
```

---

## Step 5 — Build & Run Next.js

```bash
cd /opt/caab-vans

# Build the production app
npm run build

# Test it works (Ctrl+C to stop)
npm start
```

Set up as a systemd service for auto-restart:

```bash
sudo tee /etc/systemd/system/caab-vans.service > /dev/null <<'EOF'
[Unit]
Description=CAAB Vans Next.js App
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/caab-vans
EnvironmentFile=/opt/caab-vans/.env.local
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable caab-vans
sudo systemctl start caab-vans

# Check it's running
sudo systemctl status caab-vans
```

---

## Step 6 — Configure Caddy (Reverse Proxy + TLS)

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
# Next.js web app (public)
YOUR_APP_DOMAIN {
    reverse_proxy localhost:3000
}

# Supabase API gateway (public — used by van-tracker + web frontend)
YOUR_API_DOMAIN {
    reverse_proxy localhost:54321
}

# Supabase Studio (protected with basic auth)
YOUR_STUDIO_DOMAIN {
    basicauth {
        admin <hashed-password>
    }
    reverse_proxy localhost:54324
}
```

Generate the hashed password for Studio protection:

```bash
# Generate a bcrypt hash for your studio password
caddy hash-password --plaintext 'YOUR_STUDIO_PASSWORD'
# Copy the output and paste it in the Caddyfile above
```

Restart Caddy:

```bash
sudo systemctl restart caddy

# Caddy will automatically obtain TLS certs from Let's Encrypt
sudo systemctl status caddy
```

---

## Step 7 — Open Firewall Ports

```bash
# Allow HTTP and HTTPS (Caddy needs these)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## Step 8 — Verify Everything Works

| Test | URL |
|---|---|
| Web portal | `https://YOUR_APP_DOMAIN` |
| Admin login | `https://YOUR_APP_DOMAIN/admin/login` (admin@caab.org.br / caab2026!) |
| Supabase API | `https://YOUR_API_DOMAIN/rest/v1/` (should return empty or 401) |
| Studio | `https://YOUR_STUDIO_DOMAIN` (basic auth prompt) |

In the admin panel:

1. Create a **Van** (note its ID and ingestion token)
2. Create a **Route** linked to the van
3. Add **Schedule Entries** (stops with times)

---

## Step 9 — Van-Tracker App (APK)

On your **local machine** (not VPS):

```bash
cd apps/van-tracker
npm install

# Login to EAS (you need an Expo account)
npx eas-cli login

# Build a preview APK (cloud build, free tier available)
npx eas-cli build --platform android --profile preview
```

Once built, download the APK and install it on the driver's phone.

In the app **Settings** screen, configure:

| Field | Value |
|---|---|
| API Base URL | `https://YOUR_APP_DOMAIN` |
| Van ID | UUID from admin panel |
| Ingestion Token | Token from admin panel |

Then go to **Home** and tap **Start Tracking**.

---

## Quick Troubleshooting

| Problem | Fix |
|---|---|
| Caddy won't get TLS cert | Ensure DNS A records point to VPS IP, ports 80/443 open |
| Supabase services unhealthy | `cd /opt/caab-vans/infra/supabase && docker compose logs` |
| Next.js won't start | `sudo journalctl -u caab-vans -f` |
| Migrations fail | Check `DATABASE_URL` in `.env.local` matches Supabase postgres password |
| Van-tracker gets 401 | Verify ingestion token matches the van's token in admin panel |
| Van-tracker gets network error | Ensure API Base URL uses `https://YOUR_APP_DOMAIN` (not the API domain) |

---

**Full deployment flow:** Supabase stack (Docker) → Migrations → Next.js (systemd) → Caddy (reverse proxy) → Van-Tracker APK → configure & track.
