# Ingestion API Contract

**Base path**: `/api/ingest`
**Auth**: Per-van ingestion token (`X-Ingestion-Token` header)
**Content-Type**: `application/json`

## POST /api/ingest/:vanId

Receive a Telegram message forwarded by Pabbly and extract the location link.

**Parameters**: `vanId` (uuid) — identifies which van this message belongs to.

**Headers**:
- `X-Ingestion-Token: <van-specific-token>` (required)

**Request**:

```json
{
  "message": "Full Telegram message text containing a URL"
}
```

**Response** `200 OK`:

```json
{
  "locationUrl": "https://maps.app.goo.gl/abc123",
  "updatedAt": "2026-02-26T14:20:00-03:00"
}
```

**Errors**:

- `400 Bad Request` — zero URLs or multiple URLs in message text:
  ```json
  {
    "error": {
      "code": "INVALID_MESSAGE",
      "message": "Message must contain exactly one URL"
    }
  }
  ```

- `401 Unauthorized` — missing or invalid ingestion token:
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Invalid ingestion token"
    }
  }
  ```

- `404 Not Found` — unknown vanId:
  ```json
  {
    "error": {
      "code": "NOT_FOUND",
      "message": "Van not found"
    }
  }
  ```

- `429 Too Many Requests` — rate limited:
  ```json
  {
    "error": {
      "code": "RATE_LIMITED",
      "message": "Too many requests"
    }
  }
  ```

## URL Extraction Logic

1. Parse the `message` text for URLs using a standard URL regex.
2. Count the number of URLs found.
3. If count == 1: store the URL as `location_url` on the van, set
   `location_updated_at` to current server time (America/Bahia).
4. If count == 0 or count > 1: reject with `INVALID_MESSAGE`.

## Security

- Each van has its own `ingestion_token` stored in the `vans` table.
- The token is passed in the `X-Ingestion-Token` header.
- The endpoint validates that the token matches the van identified by
  `:vanId`.
- Rate limiting is applied per vanId (FR-022).
