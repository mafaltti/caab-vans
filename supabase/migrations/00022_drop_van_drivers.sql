-- Drop legacy van_drivers table.
-- Superseded by route_drivers (migration 00018), which backfilled all data.
-- No runtime code references van_drivers.

DROP TABLE IF EXISTS van_drivers;
