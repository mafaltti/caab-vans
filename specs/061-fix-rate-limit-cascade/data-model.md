# Data Model: Fix Rate-Limit 429 Cascade

No new entities, tables, columns, or relationships are introduced by this feature.

## Modified Behavior of Existing Entities

### Rate Limiter (server, in-memory)

- **Entity**: Sliding-window counter per van ID
- **Change**: `maxRequests` configuration value from 25 → 40
- **No structural change**: Same `Map<string, number[]>` implementation

### Backoff State (tracker, AsyncStorage)

- **Entity**: `consecutiveFailures` (number) + `backoffUntil` (timestamp)
- **Change**: 429 responses no longer increment `consecutiveFailures` or set `backoffUntil`
- **Keys**: `@consecutiveFailures`, `@backoffUntil` (unchanged)
- **Behavior change**: Only 5xx and network errors trigger backoff escalation

### Location Buffer (tracker, AsyncStorage)

- **Entity**: FIFO array of `LocationPoint` objects (max 100, 24h TTL)
- **Change**: 429'd single-ping points are now added to the buffer (previously dropped)
- **Key**: `@locationBuffer` (unchanged)
- **No structural change**: Same array format, same capacity limits
