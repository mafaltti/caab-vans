type RateLimitResult = {
  allowed: boolean;
  retryAfter?: number;
};

type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
};

export function createRateLimiter({
  windowMs,
  maxRequests,
}: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = hits.get(key) ?? [];
    const valid = timestamps.filter((t) => t > windowStart);

    if (valid.length >= maxRequests) {
      const oldest = valid[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      hits.set(key, valid);
      return { allowed: false, retryAfter };
    }

    valid.push(now);
    hits.set(key, valid);

    // Cleanup stale keys periodically
    if (hits.size > 1000) {
      for (const [k, v] of hits) {
        const active = v.filter((t) => t > windowStart);
        if (active.length === 0) hits.delete(k);
        else hits.set(k, active);
      }
    }

    return { allowed: true };
  };
}
