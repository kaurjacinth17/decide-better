/**
 * Per-session sliding-window rate limit, held in memory. Good enough for a single
 * server instance; behind several instances use a shared store (Redis, KV) instead.
 */
export interface RateLimiter {
  /** Returns 0 if allowed (and records the hit), or seconds until the next slot frees up. */
  hit(key: string, now?: number): number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
      }
      recent.push(now);
      hits.set(key, recent);
      // Keep memory bounded.
      if (hits.size > 5000) for (const k of hits.keys()) if (!hits.get(k)!.some((t) => now - t < windowMs)) hits.delete(k);
      return 0;
    },
  };
}

const limit = Math.max(1, Number(process.env.AI_RATE_LIMIT) || 30);
export const sessionLimiter = createRateLimiter(limit, 60 * 60 * 1000);
