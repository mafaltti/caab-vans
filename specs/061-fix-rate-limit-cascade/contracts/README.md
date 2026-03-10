# Contracts: Fix Rate-Limit 429 Cascade

No new API contracts are introduced by this feature.

The existing tracking API contracts remain structurally unchanged — only the documented rate limit value changes from 25 to 40 req/min per van. The affected contract files are updated in-place:

- `specs/018-expo-tracker-app/contracts/tracking-api.md`
- `specs/040-tracker-resilience/contracts/batch-tracking-api.md`

The 429 response shape, HTTP status codes, and request/response schemas are all unchanged.
