# API Contract: PIN Authentication

## POST /api/driver/auth/pin-login

Authenticate a driver using their 6-digit PIN.

### Request

```
Content-Type: application/json

{
  "pin": "123456"    // string, exactly 6 digits
}
```

### Validation (Zod)

```
pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits")
```

### Success Response (200)

```json
{
  "user": {
    "id": "uuid",
    "email": "driver@example.com",
    "role": "driver"
  }
}
```

Session cookie is set via Supabase SSR cookie handler (same as email/password login).

### Error Responses

| Status | Code | Message | Condition |
|--------|------|---------|-----------|
| 400 | VALIDATION_ERROR | "PIN must be exactly 6 digits" | Invalid format |
| 401 | UNAUTHORIZED | "PIN inválido" | No match or inactive account |
| 429 | RATE_LIMITED | "Muitas tentativas. Tente novamente em X segundos" | >5 failures/min from same IP |

### Rate Limiting

- Window: 60 seconds
- Max requests: 5 failed attempts per IP
- Key: `pin-login:{client-ip}`
- Success resets nothing (rate limit tracks failures only)

### Auth Flow

1. Validate PIN format (6 digits)
2. Check rate limit for IP
3. Compute `SHA-256(pin)` → lookup `driver_pins.pin_digest`
4. If no match → 401 + increment rate limit counter
5. Verify `pin_hash` with bcrypt as confirmation
6. Check `auth.users.app_metadata.role === "driver"` and `is_active !== false`
7. Generate session via `admin.generateLink` + `verifyOtp` pattern
8. Return user info + set session cookie

---

## POST /api/admin/drivers/[userId]/pin

Set or reset a driver's PIN. Admin-only.

### Request

```
Content-Type: application/json

{
  "pin": "123456"    // string, exactly 6 digits
}
```

### Validation (Zod)

```
pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits")
```

### Auth

Requires `requireRole("admin")` (admin or superuser).

### Pre-checks

1. Verify target user exists and has `role === "driver"`
2. Verify target user is active (`is_active !== false`)

### Success Response (200)

```json
{
  "message": "PIN definido com sucesso"
}
```

### Error Responses

| Status | Code | Message | Condition |
|--------|------|---------|-----------|
| 400 | VALIDATION_ERROR | "PIN must be exactly 6 digits" | Invalid format |
| 404 | NOT_FOUND | "Motorista não encontrado" | User doesn't exist or isn't a driver |
| 409 | CONFLICT | "Este PIN já está em uso" | pin_digest UNIQUE violation |

### Implementation Notes

- Compute `pin_hash = bcrypt(pin)` and `pin_digest = SHA-256(pin).hex()`
- Upsert into `driver_pins` (INSERT ... ON CONFLICT (user_id) DO UPDATE)
- If `pin_digest` conflicts on UNIQUE constraint → 409 CONFLICT

---

## POST /api/admin/drivers/[userId]/generate-pin

Generate a random 6-digit PIN for a driver. Admin-only.

### Request

No body required.

### Auth

Requires `requireRole("admin")` (admin or superuser).

### Success Response (200)

```json
{
  "pin": "482917",
  "message": "PIN gerado com sucesso"
}
```

The PIN is returned **once** in this response. It is never retrievable again.

### Error Responses

Same as `POST /api/admin/drivers/[userId]/pin` plus:

| Status | Code | Message | Condition |
|--------|------|---------|-----------|
| 409 | CONFLICT | "Conflito ao gerar PIN. Tente novamente." | Generated PIN collides (retry) |

### Implementation Notes

- Generate: `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`
- Retry up to 3 times if UNIQUE constraint violation occurs
- Delegates to the same upsert logic as the manual PIN endpoint
