"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMe, timeoutSignal } from "./client-http";
import type { PublicState } from "./types";
import {
  COOKIE_RETRY_MS,
  KEY_PREFIX,
  afterAnswer,
  applyVoteResult,
  canSubmit,
  loadVote,
  mergeVotes,
  parseVote,
  queuedVotes,
  saveVote,
  shouldRetry,
  toVoteResult,
  type LocalVote,
} from "./vote-queue";

const RETRY_MS = 4000;

/** localStorage can throw on access itself (blocked site data), so every read goes through here. */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * This phone's vote on the current performance, and the way to cast it.
 *
 * The honesty rule: `local.state` is "recorded" only after the server said so
 * (or /api/dgl/me says it already knows the vote). `submit` writes "queued"
 * to localStorage first, so a refresh mid-request keeps the vote, then POSTs.
 * A queued vote is retried (online, tab visible, every 4 s, voting starting)
 * until the server decides it: recorded, or rejected because voting closed.
 * It is flushed even once the performance has moved on, so the answer is
 * always the server's. A decided vote is never sent again.
 *
 * A "retry" answer (the request carried no voter cookie, the server set one
 * and cast nothing) resends soon instead of waiting for the timer; after a few
 * in a row `cookiesBlocked` turns true and the page says why the vote is stuck
 * (see afterAnswer). The vote stays queued either way, never "recorded".
 *
 * Every branch lives in vote-queue.ts (unit tested); this file only wires it
 * to fetch, storage and the page lifecycle. Votes are kept in a ref (the
 * source of truth for async work) and mirrored to state for rendering.
 */
export function useVote(state: PublicState | null): {
  local: LocalVote | null;
  submit: (score: number) => void;
  cookiesBlocked: boolean;
} {
  const performanceId = state?.performanceId ?? null;
  const phase = state?.phase ?? null;

  const [votes, setVotes] = useState<Record<string, LocalVote>>({});
  const mem = useRef<Record<string, LocalVote>>({});
  const sending = useRef(new Set<string>());
  const alive = useRef(false);
  const currentId = useRef<string | null>(null);
  const currentPhase = useRef<PublicState["phase"] | null>(null);
  const retryStreak = useRef(0);
  const soonTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<(force: boolean) => void>(() => {});
  const [cookiesBlocked, setCookiesBlocked] = useState(false);

  /** The one place a vote changes: ref, storage, then (if still mounted) render state. */
  const commit = useCallback((v: LocalVote, persist: boolean) => {
    mem.current = { ...mem.current, [v.performanceId]: v };
    if (persist) {
      const s = store();
      if (s) saveVote(s, v);
    }
    if (alive.current) setVotes(mem.current);
  }, []);

  const send = useCallback(
    async (v: LocalVote) => {
      if (sending.current.has(v.performanceId)) return;
      sending.current.add(v.performanceId);
      let res: Response | null = null;
      try {
        res = await fetch("/api/dgl/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ performanceId: v.performanceId, score: v.score }),
          signal: timeoutSignal(),
        });
      } catch {
        res = null;
      }
      const outcome = await toVoteResult(res);
      sending.current.delete(v.performanceId);
      const next = afterAnswer(retryStreak.current, outcome);
      retryStreak.current = next.streak;
      if (alive.current) setCookiesBlocked(next.blocked);
      if (next.soon && alive.current) {
        clearTimeout(soonTimer.current);
        soonTimer.current = setTimeout(() => flushRef.current(true), COOKIE_RETRY_MS);
      }
      // Something else (the server seed, another tab) may have decided it meanwhile.
      const cur = mem.current[v.performanceId] ?? v;
      if (cur.state !== "queued") return;
      commit(applyVoteResult(cur, outcome), true);
    },
    [commit],
  );

  /**
   * Send what is queued. `force` (the network came back, voting opened) skips
   * the checks in `shouldRetry`, which holds back a paused vote while its
   * performance is still paused.
   */
  const flush = useCallback(
    (force: boolean) => {
      const online = navigator.onLine !== false;
      for (const v of Object.values(mem.current)) {
        if (v.state !== "queued") continue;
        if (!force && !shouldRetry(v, currentId.current, currentPhase.current, online)) continue;
        void send(v);
      }
    },
    [send],
  );

  // Refs the async code reads. Declared first so later effects see this render's values.
  useEffect(() => {
    currentId.current = performanceId;
    currentPhase.current = phase;
  }, [performanceId, phase]);

  // `send` schedules the quick resend through this ref, since `flush` is built on `send`.
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Mount: recover queued votes a refresh left behind, mirror other tabs, and wire the lifecycle triggers.
  useEffect(() => {
    alive.current = true;
    const s = store();
    if (s) {
      for (const v of queuedVotes(s)) mem.current = { ...mem.current, [v.performanceId]: mergeVotes(mem.current[v.performanceId], v) };
      setVotes(mem.current);
    }

    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;
      const id = e.key.slice(KEY_PREFIX.length);
      const theirs = parseVote(e.newValue, id);
      if (!theirs) return;
      const merged = mergeVotes(mem.current[id], theirs);
      if (merged !== mem.current[id]) commit(merged, false);
    };
    const onOnline = () => flush(true);
    const onVisibility = () => {
      if (!document.hidden) flush(false);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    flush(false);
    return () => {
      alive.current = false;
      clearTimeout(soonTimer.current);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [commit, flush]);

  // A performance becomes current: pick up what this browser already knows, ask the server what it knows,
  // and push any vote left over from the one before.
  useEffect(() => {
    let live = true;
    const s = store();
    if (performanceId && s && !mem.current[performanceId]) {
      const stored = loadVote(s, performanceId);
      if (stored) {
        mem.current = { ...mem.current, [performanceId]: stored };
        setVotes(mem.current);
      }
    }
    void fetchMe().then((me) => {
      if (!live || !me?.vote) return;
      // The server wins: whatever it holds is recorded, with its score.
      const prev = mem.current[me.vote.performanceId];
      if (prev?.state === "recorded" && prev.score === me.vote.score) return;
      commit(
        { performanceId: me.vote.performanceId, score: me.vote.score, state: "recorded", at: prev?.at ?? Date.now() },
        true,
      );
    });
    flush(false);
    return () => {
      live = false;
    };
  }, [performanceId, commit, flush]);

  // Voting opens (or reopens after a pause): everything queued goes now.
  useEffect(() => {
    if (phase === "VOTING") flush(true);
  }, [phase, flush]);

  const hasQueued = Object.values(votes).some((v) => v.state === "queued");
  useEffect(() => {
    if (!hasQueued) return;
    const id = setInterval(() => flush(false), RETRY_MS);
    return () => clearInterval(id);
  }, [hasQueued, flush]);

  const submit = useCallback(
    (score: number) => {
      const id = currentId.current;
      if (!id || !Number.isInteger(score) || score < 1 || score > 10) return;
      // One vote per performance (a rejected one may be replaced once voting is open again), and none
      // while one is already on its way.
      if (!canSubmit(mem.current[id] ?? null, currentPhase.current) || sending.current.has(id)) return;
      const v: LocalVote = { performanceId: id, score, state: "queued", at: Date.now() };
      commit(v, true);
      void send(v);
    },
    [commit, send],
  );

  return { local: performanceId ? (votes[performanceId] ?? null) : null, submit, cookiesBlocked };
}
