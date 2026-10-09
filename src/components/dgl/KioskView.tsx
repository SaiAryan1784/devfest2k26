"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle, Info, SignOut, WarningCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { timeoutSignal } from "@/lib/dgl/client-http";
import {
  kioskOutcome,
  kioskScreen,
  loadAttempt,
  newAttemptId,
  nextAttempt,
  restoreAttempt,
  saveAttempt,
  type KioskOutcome,
  type KioskSession,
} from "@/lib/dgl/kiosk-view";
import { isTrack } from "@/lib/dgl/tracks";
import type { Role, Track } from "@/lib/dgl/types";
import { useDglState } from "@/lib/dgl/use-dgl-state";
import { cn } from "@/lib/utils";
import { BTN, GHOST, OFF, PRIMARY } from "./admin-styles";
import { AdminLogin } from "./AdminLogin";
import { ConnectionPill } from "./ConnectionPill";
import { ScoreGrid } from "./ScoreGrid";
import { TrackLabel, TrackSwitcher, rememberTrack, rememberedTrack } from "./TrackSwitcher";

const c = DGL.copy;
const k = c.kiosk;
const SESSION_TIMEOUT_MS = 6000;
const VOTE_TIMEOUT_MS = 8000;

type Me = { name: string; role: Role; track: Track | null };

/** sessionStorage can throw on access itself (blocked site data), so every use goes through here. */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const ROLES: readonly string[] = ["SUPER_ADMIN", "HOST"];

function asMe(x: unknown): Me | null {
  if (typeof x !== "object" || x === null) return null;
  const me = (x as { me?: unknown }).me;
  if (typeof me !== "object" || me === null) return null;
  const { name, role, track } = me as { name?: unknown; role?: unknown; track?: unknown };
  if (track !== null && !isTrack(track)) return null;
  return typeof name === "string" && typeof role === "string" && ROLES.includes(role) ? { name, role: role as Role, track } : null;
}

/**
 * /dgl/kiosk. The first render (and the server's) is the neutral "Checking
 * session" screen: no state, nothing read from the browser while rendering.
 *
 * Signed in or not is decided by ONE GET /api/dgl/admin/state on mount (and
 * once more after signing in or pressing "Try again"): 200 is signed in and
 * names the role, 401 is the sign-in form, anything else (503, no answer) is
 * a retry message, never the form. It is not polled: volunteers are on
 * mobile data. The show phase comes from useDglState (the cached public
 * endpoint), which only starts once the kiosk itself shows. All decisions
 * come from src/lib/dgl/kiosk-view.ts (unit tested).
 */
export function KioskView() {
  const [session, setSession] = useState<KioskSession>("checking");
  const [me, setMe] = useState<Me | null>(null);
  // Bumped to run the one check again (after sign-in or "Try again").
  const [epoch, setEpoch] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState(false);
  // The server said 403 to a vote: this account cannot record, whatever the role we were told.
  const [denied, setDenied] = useState(false);
  // The track an all-track account is recording for (a track account has its own).
  const [picked, setPicked] = useState<Track>("build");
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const saved = rememberedTrack();
    // After mount only (storage is not on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setPicked(saved);
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dgl/admin/state", { cache: "no-store", signal: timeoutSignal(SESSION_TIMEOUT_MS) });
        if (!alive) return;
        if (res.status === 401) {
          setMe(null);
          setSession("signedOut");
          return;
        }
        const who = res.ok ? asMe(await res.json().catch(() => null)) : null;
        if (!alive) return;
        if (who) {
          setMe(who);
          setSession("signedIn");
        } else {
          setSession("unreachable");
        }
      } catch {
        if (alive) setSession("unreachable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [epoch]);

  const recheck = useCallback(() => {
    setSession("checking");
    setEpoch((e) => e + 1);
  }, []);

  const onSignedIn = useCallback(() => {
    setNote(null);
    setDenied(false);
    recheck();
  }, [recheck]);

  const onSessionEnded = useCallback(() => {
    setMe(null);
    setNote(c.admin.sessionEnded);
    setSession("signedOut");
  }, []);

  const signOut = useCallback(async () => {
    setSignOutError(false);
    try {
      const res = await fetch("/api/dgl/admin/logout", { method: "POST", cache: "no-store", signal: timeoutSignal(SESSION_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`logout ${res.status}`);
      // A deliberate sign-out ends the unsettled press too: the next person starts a new vote.
      saveAttempt(sessionStore(), null);
      if (!mounted.current) return;
      setMe(null);
      setNote(null);
      setDenied(false);
      setSession("signedOut");
    } catch {
      if (mounted.current) setSignOutError(true);
    }
  }, []);

  // Phase is unknown at this level (useDglState lives in <Kiosk>), so this only settles session and role.
  const gate = denied ? "wrong-role" : kioskScreen({ session, role: me?.role ?? null, phase: null });

  if (gate === "login") {
    return (
      <div className="flex min-h-[100dvh] items-center px-4 py-10">
        <AdminLogin onSignedIn={onSignedIn} note={note} />
      </div>
    );
  }
  if (gate === "checking") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4">
        <p role="status" className="text-[17px] text-muted">
          {k.checking}
        </p>
      </div>
    );
  }
  if (gate === "retry") {
    return (
      <Centered>
        <p role="status" className="flex items-start gap-2 text-[17px] leading-snug text-yellow-hi">
          <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
          {k.unreachable}
        </p>
        <button type="button" onClick={recheck} className={cn(BTN, PRIMARY, "h-14 w-full px-6 text-[17px]")}>
          {k.tryAgain}
        </button>
      </Centered>
    );
  }
  if (gate === "wrong-role" && me) {
    return (
      <Centered>
        <p role="status" className="text-[17px] leading-snug text-text">
          {k.wrongRole}
        </p>
        <SignOutButton onClick={() => void signOut()} className="w-full" />
        {signOutError && <p role="status" className="text-[15px] text-red-hi">{c.admin.signOutFailed}</p>}
      </Centered>
    );
  }
  if (!me) return null;
  const track = me.track ?? picked;
  return <Kiosk key={track} me={me} track={track} onTrack={(t) => { rememberTrack(t); setPicked(t); }} onSignOut={() => void signOut()} signOutError={signOutError} onSessionEnded={onSessionEnded} onDenied={() => setDenied(true)} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col justify-center gap-5 px-4 py-10">{children}</div>;
}

function SignOutButton({ onClick, className }: { onClick(): void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(BTN, GHOST, "h-11 px-4 text-[15px]", className)}>
      <SignOut aria-hidden="true" weight="regular" className="size-5" />
      {c.admin.signOut}
    </button>
  );
}

type KioskProps = {
  me: Me;
  track: Track;
  onTrack(t: Track): void;
  onSignOut(): void;
  signOutError: boolean;
  onSessionEnded(): void;
  onDenied(): void;
};

const TONE: Record<KioskOutcome["tone"], string> = {
  success: "text-green-hi",
  warn: "text-yellow-hi",
  error: "text-red-hi",
};

/**
 * The signed-in kiosk. There is no offline queue and no retry: one press is
 * one request, and the screen says "Recorded" only when the server answered
 * recorded (see kioskOutcome). The pick belongs to its performance; after a
 * recorded vote the grid locks for DGL.limits.kioskGapMs (matching the
 * server's per-admin gap) and then clears. Every press carries an attempt id
 * that survives a failed or unanswered try (and a reload of this tab), so
 * pressing again is safe.
 */
function Kiosk({ me, track, onTrack, onSignOut, signOutError, onSessionEnded, onDenied }: KioskProps) {
  const { state, connection } = useDglState(track);
  const phase = state?.phase ?? null;
  const performanceId = state?.performanceId ?? null;
  const screen = kioskScreen({ session: "signedIn", role: me.role, phase });

  const [pick, setPick] = useState<{ id: string; n: number } | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; o: KioskOutcome } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  // Set synchronously, before any await, so a second press in the same tick cannot send twice.
  const inFlight = useRef(false);
  // The id of the press that is not settled yet, per act. Kept across every outcome that leaves
  // the vote's fate unknown or retryable, so a repeat press resends it and the server answers
  // "duplicate" instead of counting twice (see nextAttempt). Mirrored to sessionStorage, so a
  // reload, or the re-sign-in after a 401 (which unmounts this component), still resends it for
  // the same act; cleared on a definitive outcome and on sign-out. Never read while rendering.
  const attempt = useRef<{ id: string; forId: string } | null>(null);
  const lockedRef = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const scoreTitle = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(lockTimer.current);
    };
  }, []);

  // Pick up an unsettled press a reload or a re-sign-in left behind, only for the act it was made for.
  useEffect(() => {
    if (!performanceId || attempt.current?.forId === performanceId) return;
    const restored = restoreAttempt(loadAttempt(sessionStore()), performanceId);
    if (restored) attempt.current = restored;
  }, [performanceId]);

  const picked = pick && pick.id === performanceId ? pick.n : null;
  // Only a vote's own answer, only on the voting screen, only for this act.
  const shown = screen === "voting" && outcome && outcome.id === performanceId ? outcome.o : null;

  const onPick = (n: number) => {
    if (!performanceId || inFlight.current || lockedRef.current) return;
    setPick({ id: performanceId, n });
    setOutcome(null);
  };

  async function record() {
    if (inFlight.current || lockedRef.current || picked === null || !performanceId) return;
    inFlight.current = true;
    setBusy(true);
    setOutcome(null);
    const forId = performanceId;
    const sent = picked;
    const prior = attempt.current?.forId === forId ? attempt.current.id : null;
    const attemptId = nextAttempt(prior, "press", newAttemptId) as string;
    attempt.current = { id: attemptId, forId };
    saveAttempt(sessionStore(), attempt.current);
    let status: number | null = null;
    let body: unknown = null;
    try {
      const res = await fetch("/api/dgl/kiosk/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ performanceId: forId, score: sent, attemptId, track }),
        cache: "no-store",
        signal: timeoutSignal(VOTE_TIMEOUT_MS),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch {
      status = null;
    } finally {
      inFlight.current = false;
    }
    if (!mounted.current) return;
    setBusy(false);
    const out = kioskOutcome(status, body, sent);
    if (nextAttempt(attemptId, out.kind, newAttemptId) === null) {
      attempt.current = null;
      saveAttempt(sessionStore(), null);
    }
    if (out.kind === "signed_out") return onSessionEnded();
    if (out.kind === "forbidden") return onDenied();
    setOutcome({ id: forId, o: out });
    if (out.lock) {
      // Show what the server has, not what was pressed, if an earlier try of this press went through.
      if (out.score !== null) setPick({ id: forId, n: out.score });
      lockedRef.current = true;
      setLocked(true);
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => {
        lockedRef.current = false;
        if (!mounted.current) return;
        setLocked(false);
        setPick(null);
      }, DGL.limits.kioskGapMs);
    } else if (!out.keepSelection) {
      setPick(null);
    }
  }

  const off = picked === null || busy || locked;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col gap-5 px-4 pb-8 pt-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-muted">{DGL.name}</p>
            <h1 className="display text-[22px] font-semibold leading-tight">{k.heading}</h1>
          </div>
          <ConnectionPill connection={connection} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-[15px] text-text">
            <span className="font-medium">{me.name}</span>
            <span className="text-muted">, {c.admin.roles[me.role]}</span>
          </p>
          <SignOutButton onClick={onSignOut} />
        </div>
        {me.track === null ? <TrackSwitcher value={track} onChange={onTrack} /> : <TrackLabel track={track} />}
        {signOutError && (
          <p role="status" className="text-[15px] text-red-hi">
            {c.admin.signOutFailed}
          </p>
        )}
      </header>

      <section aria-label={DGL.name} className="flex flex-col gap-1">
        {state?.contestant && <h2 className="display line-clamp-2 break-words text-[28px] font-semibold leading-[1.1]">{state.contestant}</h2>}
        {state?.prompt && <p className="mt-1 line-clamp-3 break-words text-[17px] leading-snug text-muted">{state.prompt}</p>}
        {phase && <p className="mt-2 font-mono text-[14px] text-muted">{c.admin.phases[phase]}</p>}
      </section>

      {state && screen === "voting" && (
        <div className="flex flex-col gap-3">
          <h3 id={scoreTitle} className="text-[17px] font-semibold text-blue-hi">
            {k.scoreTitle}
          </h3>
          <ScoreGrid value={picked} onChange={onPick} disabled={busy || locked} labelledBy={scoreTitle} />
        </div>
      )}
      {!state && <p className="text-[17px] text-muted">{k.loading}</p>}
      {state && screen === "not-open" && <p className="text-[19px] font-medium text-text">{k.notOpen}</p>}
      {state && screen === "paused" && (
        <div className="flex flex-col gap-1">
          <p className="text-[19px] font-medium text-text">{c.votePaused}</p>
          <p className="text-[17px] text-muted">{k.pausedBody}</p>
        </div>
      )}
      {state && screen === "closed" && <p className="text-[19px] font-medium text-text">{c.votingClosed}</p>}

      {/* Always mounted so a screen reader hears each outcome. Only a vote's own answer shows here. */}
      <p
        role="status"
        aria-live="polite"
        className={cn("min-h-7 text-[17px] font-semibold leading-snug", shown ? TONE[shown.tone] : "sr-only")}
      >
        {shown && (
          <span className="flex items-start gap-2">
            {shown.tone === "success" ? (
              <CheckCircle aria-hidden="true" weight="regular" className="mt-[2px] size-6 shrink-0" />
            ) : shown.tone === "warn" ? (
              <Info aria-hidden="true" weight="regular" className="mt-[2px] size-6 shrink-0" />
            ) : (
              <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-6 shrink-0" />
            )}
            <span className="flex flex-col gap-1">
              {shown.text}
              {shown.score !== null && <span className="font-mono text-[15px] font-medium tabular-nums">{k.outcome.confirmedScore(shown.score)}</span>}
            </span>
          </span>
        )}
      </p>

      {state && screen === "voting" && (
        <button
          type="button"
          onClick={() => void record()}
          aria-disabled={off || undefined}
          className={cn(BTN, "min-h-14 w-full px-6 text-[19px] font-semibold", off ? OFF : PRIMARY)}
        >
          {busy ? k.sending : picked === null ? k.pickScore : k.record(picked)}
        </button>
      )}
    </div>
  );
}
