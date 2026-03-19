CREATE TABLE driver_pins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  pin_hash TEXT NOT NULL,
  pin_digest CHAR(64) NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE driver_pins ENABLE ROW LEVEL SECURITY;
