/**
 * Best-effort in-memory fixed-window rate limiter.
 * Limitation: serverless instances do not share memory, so this slows abuse but is not a hard
 * guarantee. Sensitive public endpoints additionally rely on 256-bit tokens that cannot be guessed.
 */
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return b.count <= limit ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

export function resetRateLimits(): void {
  buckets.clear();
}
