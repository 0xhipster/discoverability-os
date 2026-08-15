/**
 * Minimal in-memory rate limiter.
 *
 * CAVEAT: this state lives in the memory of a single serverless function
 * instance. A "warm" Vercel instance serving repeat requests will enforce
 * this correctly, but under real concurrent traffic you'll have multiple
 * instances running in parallel, each with its own counters — so this is a
 * soft speed bump against casual abuse and accidental loops, not a hard
 * global guarantee. Cold starts also reset it entirely. For a production
 * deployment expecting real traffic, swap this for a shared store (Upstash
 * Redis, Vercel KV, etc.) so the limit is enforced across all instances.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}

// Keep the map from growing unbounded under sustained traffic from many
// distinct IPs on a long-lived warm instance.
const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, bucket] of buckets) {
    if (bucket.windowStart < cutoff) buckets.delete(key);
  }
}, WINDOW_MS);
// Don't let this timer keep the serverless process alive on its own.
if (typeof cleanupInterval.unref === "function") cleanupInterval.unref();
