import { estimateOffset } from "./clock";
import type { Track } from "./types";

/** Browser-side fetch helpers shared by the DGL hooks. No React, no server imports. */

export const FETCH_TIMEOUT_MS = 6000;

/** `AbortSignal.timeout`, with a fallback for browsers that predate it. */
export function timeoutSignal(ms: number = FETCH_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), ms);
  return ctl.signal;
}

/** The URLs the hooks poll, one place so tests can pin them. */
export const stateUrl = (track: Track) => `/api/dgl/state?track=${track}`;
export const meUrl = (track: Track) => `/api/dgl/me?track=${track}`;
/** Null asks the server for the admin's default track. */
export const adminStateUrl = (track: Track | null) => (track ? `/api/dgl/admin/state?track=${track}` : "/api/dgl/admin/state");

export type Me = {
  /** This voter's vote on the server's current performance. */
  vote: { performanceId: string; score: number } | null;
  /** One clock sample: server time minus phone time, and the round trip it came from. */
  offset: number;
  rtt: number;
};

const inflight = new Map<Track, Promise<Me | null>>();

/**
 * GET /api/dgl/me?track= (which also sets the voter cookie). Calls made while one is
 * already in flight share it, so the clock and the vote seed cost one request
 * on page load, not two. Null on any failure.
 */
export function fetchMe(track: Track): Promise<Me | null> {
  const existing = inflight.get(track);
  if (existing) return existing;
  const run = (async (): Promise<Me | null> => {
    const sentAt = Date.now();
    try {
      const res = await fetch(meUrl(track), { cache: "no-store", signal: timeoutSignal() });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const receivedAt = Date.now();
      if (typeof body !== "object" || body === null) return null;
      const { serverNow, vote } = body as { serverNow?: unknown; vote?: unknown };
      if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return null;
      let parsed: Me["vote"] = null;
      if (typeof vote === "object" && vote !== null) {
        const v = vote as { performanceId?: unknown; score?: unknown };
        if (typeof v.performanceId === "string" && typeof v.score === "number" && Number.isInteger(v.score)) {
          parsed = { performanceId: v.performanceId, score: v.score };
        }
      }
      return { vote: parsed, offset: estimateOffset(sentAt, serverNow, receivedAt), rtt: receivedAt - sentAt };
    } catch {
      return null;
    }
  })();
  inflight.set(track, run);
  void run.then(() => {
    inflight.delete(track);
  });
  return run;
}
