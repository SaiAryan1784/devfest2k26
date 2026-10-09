"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DGL } from "@/data/dgl";
import { outcomeOf, settleKey, SETTLE_MS } from "./admin-view";
import { estimateOffset, pickOffset } from "./clock";
import { adminStateUrl, timeoutSignal } from "./client-http";
import type { Action, ActionResult, AdminState, Track } from "./types";
import { connectionFor, type Connection } from "./connection";

/** "checking" until /admin/state first answers; 401 means "signedOut". */
export type Session = "checking" | "signedIn" | "signedOut";

export type UseAdmin = {
  /** The last good admin state (kept through network failures), null when signed out. */
  state: AdminState | null;
  /**
   * Sends `a` with `expectedVersion` (the version of the state the control
   * was rendered from) or, without it, the latest version seen. Null when
   * nothing was sent or no answer came back.
   */
  act(a: Action, expectedVersion?: number): Promise<ActionResult | null>;
  /** The note for the last action or sign out that did not simply work (stale, refused, network). */
  error: string | null;
  session: Session;
  connection: Connection;
  /** Server time minus this device's clock (see clock.ts). */
  offset: number;
  /** True while an action is in flight. */
  busy: boolean;
  /** performance.now() when an adopted state last changed the big button (settleKey), else null. */
  changedAt: number | null;
  /** True for SETTLE_MS after `changedAt`: guarded controls render as "Updating". */
  settling: boolean;
  /** Re-check the session now (after signing in). */
  refresh(): void;
  signOut(): Promise<void>;
};

const SAMPLES = 5;
const a = DGL.copy.admin;

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

function asAdminState(x: unknown): AdminState | null {
  if (typeof x !== "object" || x === null) return null;
  const s = x as Partial<AdminState>;
  return typeof s.phase === "string" &&
    typeof s.version === "number" &&
    typeof s.serverNow === "number" &&
    Number.isFinite(s.serverNow) &&
    typeof s.track === "string" &&
    Array.isArray(s.acts) &&
    Array.isArray(s.prompts) &&
    typeof s.me === "object" &&
    s.me !== null
    ? (x as AdminState)
    : null;
}

function asActionResult(x: unknown): ActionResult | null {
  if (typeof x !== "object" || x === null) return null;
  const r = x as { ok?: unknown; code?: unknown; state?: unknown };
  if (typeof r.ok !== "boolean" || !asAdminState(r.state)) return null;
  if (!r.ok && typeof r.code !== "string") return null;
  return x as ActionResult;
}

/** The note an action result needs, from DGL.copy; null when it worked. */
export function outcomeText(r: ActionResult | null): string | null {
  const o = outcomeOf(r);
  if (o === null) return null;
  if (o === "not_allowed") return a.outcome.notAllowed(a.phases[r!.state.phase]);
  if (o === "network") return a.outcome.network;
  return a.outcome[o];
}

/** Equal when nothing but the server's clock stamp changed. */
function stateKey(s: AdminState): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { serverNow, ...rest } = s;
  return JSON.stringify(rest);
}

/**
 * The admin console's link to the show: polls GET /api/dgl/admin/state
 * every DGL.poll.adminMs and sends actions to POST /api/dgl/admin/action.
 *
 * - Signed in or not is decided by /admin/state: 200 is signed in, 401 is
 *   signed out (the session cookie is httpOnly; this never sees it). Polling
 *   stops on 401 and starts again on `refresh()`. A 401 after the console
 *   was showing the show sets the "session ended" note in place of any
 *   action note.
 * - One timer chain (setTimeout, never setInterval). It does not run while
 *   the tab is hidden and fires straight away on becoming visible or online.
 *   Network trouble keeps the last good state and shows in `connection`.
 * - `act` sends the version the control was rendered from (or, without
 *   one, the latest seen) and adopts the state in the answer at once. `stale` means someone else changed the show first: the fresh
 *   state is adopted and the note says so; the action is NOT retried. A poll
 *   that left before an action's answer arrived is ignored, so an older read
 *   never overwrites a newer result. An in-flight ref blocks double submits.
 * - When an adopted state changes the big button (settleKey), `changedAt`
 *   and `settling` let the console ignore guarded taps for SETTLE_MS.
 * - The clock offset comes from each poll's round trip (lowest of the last
 *   five), ignoring changes under 25 ms.
 */
export function useAdmin(track: Track | null): UseAdmin {
  const [state, setState] = useState<AdminState | null>(null);
  const [session, setSession] = useState<Session>("checking");
  const [failing, setFailing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped to restart polling (sign in, sign out); the old loop's answers are dropped.
  const [epoch, setEpoch] = useState(0);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const online = useSyncExternalStore(subscribeOnline, isOnline, serverOnline);

  const latest = useRef<AdminState | null>(null);
  const lastKey = useRef("");
  const adoptedAt = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(settleTimer.current);
    };
  }, []);

  /**
   * The one place a new state lands: the ref always, render state only when
   * something besides serverNow changed. When the big button changes (from an
   * action's answer or another admin's change seen in a poll) guarded
   * controls settle for SETTLE_MS. Not on the first state after loading or
   * signing in: nobody is mid-tap then.
   */
  const adopt = useCallback((next: AdminState | null) => {
    const prev = latest.current;
    latest.current = next;
    if (prev && next && settleKey(prev) !== settleKey(next)) {
      setChangedAt(performance.now());
      setSettling(true);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        if (mounted.current) setSettling(false);
      }, SETTLE_MS);
    }
    const key = next ? stateKey(next) : "";
    if (key !== lastKey.current) {
      lastKey.current = key;
      setState(next);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let polling = false;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const samples: { offset: number; rtt: number }[] = [];

    const schedule = (wait: number) => {
      clearTimeout(timer);
      if (alive && !stopped && !document.hidden) timer = setTimeout(poll, wait);
    };

    async function poll() {
      if (!alive || stopped || polling) return;
      clearTimeout(timer);
      polling = true;
      const sentAt = Date.now();
      try {
        const res = await fetch(adminStateUrl(track), { cache: "no-store", signal: timeoutSignal() });
        if (!alive) return;
        if (res.status === 401) {
          stopped = true;
          failures = 0;
          setFailing(false);
          // A screen that was showing the show lost its session (expired, deactivated): say so on the
          // sign in form, and drop any action note ("Updated.") that would be stale there. A first
          // check, or the check after a deliberate sign out, had no state and shows no note.
          const wasSignedIn = latest.current !== null;
          adopt(null);
          setError(wasSignedIn ? a.sessionEnded : null);
          setSession("signedOut");
          return;
        }
        if (!res.ok) throw new Error(`admin state ${res.status}`);
        const next = asAdminState(await res.json());
        const receivedAt = Date.now();
        if (!next) throw new Error("admin state shape");
        // A state for another track (a late answer after a switch) is not this screen's.
        if (track && next.track !== track) throw new Error("admin state track");
        if (!alive) return;
        failures = 0;
        setFailing(false);
        setSession("signedIn");
        samples.push({ offset: estimateOffset(sentAt, next.serverNow, receivedAt), rtt: receivedAt - sentAt });
        if (samples.length > SAMPLES) samples.shift();
        const best = pickOffset(samples);
        setOffset((prev) => (Math.abs(best - prev) < 25 ? prev : best));
        // An action answered after this poll left: its state is newer.
        if (sentAt >= adoptedAt.current) adopt(next);
      } catch {
        if (!alive) return;
        failures += 1;
        if (failures >= 2) setFailing(true);
      } finally {
        polling = false;
        schedule(DGL.poll.adminMs);
      }
    }

    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void poll();
    };
    const onOnline = () => void poll();

    schedule(0);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [epoch, adopt, track]);

  const act = useCallback(
    async (action: Action, expectedVersion?: number): Promise<ActionResult | null> => {
      const cur = latest.current;
      if (inFlight.current || !cur) return null;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/dgl/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The rendered version: a button re-labelled since it was drawn comes back stale, not as the new action.
          body: JSON.stringify({ track: cur.track, action, version: expectedVersion ?? cur.version }),
          cache: "no-store",
          signal: timeoutSignal(),
        });
        if (!mounted.current) return null;
        if (res.status === 401) {
          adopt(null);
          setSession("signedOut");
          setError(a.sessionEnded);
          return null;
        }
        const result = asActionResult(await res.json().catch(() => null));
        if (!mounted.current) return null;
        if (!result) {
          // No state in the body: a malformed request, a refused origin, or the server is down.
          setError(res.status === 400 ? a.outcome.invalid : res.status === 403 ? a.outcome.forbidden : a.outcome.network);
          return null;
        }
        adoptedAt.current = Date.now();
        adopt(result.state);
        setError(outcomeText(result));
        return result;
      } catch {
        if (mounted.current) setError(a.outcome.network);
        return null;
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [adopt],
  );

  const refresh = useCallback(() => {
    setError(null);
    setSession("checking");
    setEpoch((e) => e + 1);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const res = await fetch("/api/dgl/admin/logout", { method: "POST", cache: "no-store", signal: timeoutSignal() });
      if (!res.ok) throw new Error(`logout ${res.status}`);
      if (!mounted.current) return;
      adopt(null);
      setError(null);
      setSession("signedOut");
      // Restart the loop so a poll already in flight cannot sign this screen back in; the new one hears 401 and stops.
      setEpoch((e) => e + 1);
    } catch {
      if (mounted.current) setError(a.signOutFailed);
    }
  }, [adopt]);

  // "connecting" while the session is being checked (first load, after signing in): nothing has answered yet.
  const connection: Connection = connectionFor(online, failing, session !== "checking");
  return { state, act, error, session, connection, offset, busy, changedAt, settling, refresh, signOut };
}
