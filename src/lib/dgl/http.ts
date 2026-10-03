import { createHmac } from "node:crypto";

/** First `x-forwarded-for` entry, else `x-real-ip`, else "unknown". */
export function clientIp(req: Request): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Keyed hash of an IP, so the database and logs never hold a raw address:
 * HMAC-SHA256 hex, first 32 characters.
 */
export function ipHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

/**
 * Fixed-window counter, `hit` returns true when the hit is allowed. A blocked
 * hit does not extend the window.
 *
 * PER INSTANCE, BEST EFFORT: the counters live in this process's memory. On
 * serverless every warm instance has its own, so this is a speed bump against
 * a runaway client, not a global limit. The real guards are the unique
 * (performance, voter) key and the burst flag in the database.
 */
export function createLimiter(max: number, windowMs: number) {
  const windows = new Map<string, { start: number; n: number }>();
  return {
    hit(key: string, now: number): boolean {
      // Drop expired windows once the map grows, so it cannot grow unbounded.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
      }
      const w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        windows.set(key, { start: now, n: 1 });
        return max >= 1;
      }
      if (w.n >= max) return false;
      w.n += 1;
      return true;
    },
  };
}

/**
 * CSRF guard for state-changing POSTs: the Origin header's host must equal the
 * request's host. A request with NO Origin is refused too: browsers always send
 * Origin on cross-origin POSTs and on same-origin fetch POSTs, so a missing one
 * is never one of our own pages (only a non-browser client, which has no
 * cookies of ours to abuse anyway).
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return originHost === host;
}
