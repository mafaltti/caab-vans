-- 00001_initial_schema.sql
-- Initial schema for CAAB Vans MVP (data-model.md)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE vans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_url text,
  location_updated_at timestamptz,
  ingestion_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  van_id uuid NOT NULL UNIQUE REFERENCES vans(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_name text NOT NULL,
  time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, time)
);

CREATE INDEX idx_schedule_entries_route_time ON schedule_entries (route_id, time);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_display_order ON announcements (is_pinned DESC, created_at DESC);

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vans_updated_at
  BEFORE UPDATE ON vans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE vans ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Public read (anon role)
CREATE POLICY "anon_select_vans" ON vans
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_routes" ON routes
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_schedule_entries" ON schedule_entries
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_announcements" ON announcements
  FOR SELECT TO anon
  USING (expires_at IS NULL OR expires_at > now());

-- Service role bypasses RLS by default, so no explicit write policies needed.
-- All writes go through BFF using the service role key.
