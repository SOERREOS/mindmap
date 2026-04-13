/**
 * Sliding-window rate limiter backed by Upstash Redis REST API.
 *
 * Key format:  rl:{label}:{ip}:{windowIndex}
 * windowIndex = Math.floor(Date.now() / windowMs)  — changes every window
 */

type RedisClient = (cmd: string[]) => Promise<{ result?: unknown }>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  redisClient: RedisClient,
  label: string,
  ip: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowIndex = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rl:${label}:${ip}:${windowIndex}`;

  const incrRes = await redisClient(['INCR', key]);
  const count = typeof incrRes?.result === 'number' ? incrRes.result : 1;

  // Set TTL on first request so the key auto-expires
  if (count === 1) {
    await redisClient(['EXPIRE', key, String(windowSeconds * 2)]);
  }

  const remaining = Math.max(0, limit - count);
  const windowEndMs = (windowIndex + 1) * windowSeconds * 1000;
  const retryAfterSeconds = Math.ceil((windowEndMs - Date.now()) / 1000);

  return { allowed: count <= limit, remaining, retryAfterSeconds };
}

export function getClientIP(req: Request): string {
  const xfwd = (req.headers as Headers).get('x-forwarded-for');
  if (xfwd) return xfwd.split(',')[0].trim();
  const xreal = (req.headers as Headers).get('x-real-ip');
  if (xreal) return xreal.trim();
  return 'unknown';
}
