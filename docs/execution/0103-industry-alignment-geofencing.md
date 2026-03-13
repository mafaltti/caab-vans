## QUESTION: Does this align with the approach used by the industry?

Yes. This is the standard approach for fleet tracking and transit apps. Some examples:

- **Google Maps / Waze** — use the same `GeofencingClient` API for arrival detection. Google explicitly recommends OS-level geofencing over app-level GPS polling for reliability and battery efficiency.

- **OneBusAway** (open-source transit tracker used by dozens of US cities) — uses OS geofencing for stop arrival/departure detection, buffers events offline, syncs when connectivity returns.

- **Fleet management platforms (Samsara, Geotab, Verizon Connect)** — all use device-side geofencing for stop detection. The server receives events, not raw GPS that it tries to interpret. Raw GPS is used for map display, geofence events are used for stop detection — two separate concerns.

- **Uber/Lyft** — arrival at pickup/dropoff points is detected device-side using OS geofencing, not server-side from GPS pings.

The current approach (server tries to infer stop visits from raw GPS pings) is the one that's unusual. It works for simple cases but breaks under exactly the conditions you're seeing — gaps, sparse pings, rate limits, repeated stops.

The industry pattern is clear: **device detects, server records.** Raw GPS is for drawing the dot on the map. Stop detection is a separate, device-side responsibility using OS geofencing APIs that are designed to be reliable even when the app has no network or is killed.
