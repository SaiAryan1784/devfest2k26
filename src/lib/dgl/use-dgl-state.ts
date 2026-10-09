"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DGL } from "@/data/dgl";
import { pickOffset, pollDelay } from "./clock";
import { fetchMe, stateUrl, timeoutSignal } from "./client-http";
import { connectionFor, type Connection } from "./connection";
import type { PublicState, Track } from "./types";

const OFFSET_REFRESH_MS = 60_000;
const SAMPLES = 5;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const isOnline = () => navigator.onLine;
const serverOnline = () => true;

function asPublicState(x: unknown): PublicState | null {
  if (typeof x !== "object" || x === null) return null;
  const s = x as Partial<PublicState>;
  return typeof s.phase === "string" && typeof s.votes === "number" && typeof s.track === "string" ? (x as PublicState) : null;
}

/**
 * The show, polled. `state` is the last good PublicState (kept through
 * failures), `offset` is server time minus this phone's clock (see
 * clock.ts), `connection` is what to tell the voter ("connecting" until the
 * first good poll, on the server too, so hydration matches).
 *
 * One timer, restarted whenever the cadence changes. It does not run while
 * the tab is hidden, and fires straight away on becoming visible or online.
 * Discrete values only, so plain state; nothing here is continuous.
 */
export function useDglState(track: Track): { state: PublicState | null; offset: number; connection: Connection } {
  const [state, setState] = useState<PublicState | null>(null);
  const [offset, setOffset] = useState(0);
  const [failing, setFailing] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, isOnline, serverOnline);
  const failures = useRef(0);
  const lastJson = useRef("");
  const lastPollAt = useRef(0);

  const delay = pollDelay(state?.phase ?? null, DGL.poll);

  useEffect(() => {
    let alive = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (wait: number) => {
      clearTimeout(timer);
      if (alive && !document.hidden) timer = setTimeout(poll, wait);
    };

    async function poll() {
      if (!alive || busy) return;
      clearTimeout(timer);
      busy = true;
      lastPollAt.current = Date.now();
      try {
        const res = await fetch(stateUrl(track), { cache: "no-store", signal: timeoutSignal() });
        if (!res.ok) throw new Error(`state ${res.status}`);
        const next = asPublicState(await res.json());
        if (!next) throw new Error("state shape");
        if (!alive) return;
        failures.current = 0;
        setFailing(false);
        // Most polls change nothing: skip the render when they did not.
        const json = JSON.stringify(next);
        if (json !== lastJson.current) {
          lastJson.current = json;
          setState(next);
        }
      } catch {
        if (!alive) return;
        failures.current += 1;
        if (failures.current >= 2) setFailing(true);
      } finally {
        busy = false;
        schedule(delay);
      }
    }

    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void poll();
    };
    const onOnline = () => void poll();

    // First run polls now; a cadence change waits out what is left of the new delay.
    schedule(Math.max(0, lastPollAt.current + delay - Date.now()));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [delay, track]);

  // The clock: /api/dgl/me on mount and every 60 s, keeping the lowest round trip of the last few.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastAt = 0;
    const samples: { offset: number; rtt: number }[] = [];

    const measure = async () => {
      clearTimeout(timer);
      if (!document.hidden) {
        lastAt = Date.now();
        const me = await fetchMe(track);
        if (!alive) return;
        if (me) {
          samples.push({ offset: me.offset, rtt: me.rtt });
          if (samples.length > SAMPLES) samples.shift();
          const best = pickOffset(samples);
          // Under 25 ms is jitter, not drift: do not re-render the countdown for it.
          setOffset((prev) => (Math.abs(best - prev) < 25 ? prev : best));
        }
      }
      timer = setTimeout(measure, OFFSET_REFRESH_MS);
    };
    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastAt >= OFFSET_REFRESH_MS) void measure();
    };

    void measure();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [track]);

  // The first good poll always sets `state` (lastJson starts empty), so a state means a poll answered.
  const connection: Connection = connectionFor(online, failing, state !== null);
  return { state, offset, connection };
}
