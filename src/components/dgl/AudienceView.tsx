"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CheckCircle, HourglassMedium, LockSimple, PauseCircle, Trophy, WarningCircle, XCircle } from "@phosphor-icons/react";
import { DGL, type Track } from "@/data/dgl";
import { audienceSoFar, liveText, revealLines, tallyAverage, viewFor, type AudienceView as View, type Tally, type VoteShown } from "@/lib/dgl/audience-view";
import { useDglState } from "@/lib/dgl/use-dgl-state";
import { useSpinning } from "@/lib/dgl/use-spin";
import { useVote } from "@/lib/dgl/use-vote";
import { cn } from "@/lib/utils";
import { ActCard } from "./ActCard";
import { PhoneHeader } from "./PhoneHeader";
import { ScoreGrid } from "./ScoreGrid";

const c = DGL.copy;

/*
 * `[@media(max-height:700px)]:` classes: under 700 px tall (a 360 x 640 phone
 * shows about 510 px of page) the voting-grid screen tightens so the grid and
 * "Lock in" fit without scrolling. Taller screens (390 x 844 and up) are
 * unaffected. Written out in full each time so Tailwind's scanner sees them.
 */

/** State colour for a vote line (PAL hi tones); the words always say the same thing. */
const LINE_TONE: Record<VoteShown["line"], string> = {
  voteRecorded: "text-green-hi",
  voteNotCounted: "text-red-hi",
  voteQueued: "text-muted",
  votePaused: "text-muted",
  voteCookiesBlocked: "text-yellow-hi",
};
const LINE_ICON = {
  voteRecorded: CheckCircle,
  voteNotCounted: XCircle,
  voteQueued: HourglassMedium,
  votePaused: PauseCircle,
  voteCookiesBlocked: WarningCircle,
} as const;

/**
 * The audience page's live part: one screen per phase, cross-faded. All
 * decisions come from `viewFor` (src/lib/dgl/audience-view.ts, unit tested);
 * this only renders them. Hydration: both hooks start neutral (no state, no
 * vote, connection "connecting"), so the first client render is the server's IDLE
 * screen; nothing here reads window, navigator or storage while rendering.
 */
export function AudienceView({ track }: { track: Track }) {
  const { state, offset, connection } = useDglState(track);
  const { local, submit, cookiesBlocked } = useVote(state, track);
  const spinning = useSpinning(state?.spunAtMs ?? null, offset);
  const view = viewFor(state, local, cookiesBlocked, spinning);
  const reduce = useReducedMotion();
  const fade = reduce ? { duration: 0 } : { duration: 0.2 };

  // The cell picked before locking in, tied to its performance so a new act starts unpicked.
  const performanceId = state?.performanceId ?? null;
  const [pick, setPick] = useState<{ id: string; n: number } | null>(null);
  const picked = pick && pick.id === performanceId ? pick.n : null;
  // Set on "Lock in" so the locked score takes keyboard focus when it appears (the button it replaces is gone).
  const focusLockedRef = useRef(false);

  const lockIn = () => {
    if (picked === null) return;
    focusLockedRef.current = true;
    submit(picked);
  };

  return (
    <>
      <PhoneHeader track={track} connection={connection} />
      <p aria-live="polite" className="sr-only">
        {liveText(view)}
      </p>
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={view.kind}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          className={cn(
            "mt-6 flex flex-1 flex-col gap-5",
            // The voting screen ends in the pinned footer, which carries its own bottom padding; the rest need theirs here.
            view.kind === "voting-grid" ? "[@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:gap-2" : "pb-6",
          )}
        >
          <Screen
            view={view}
            offset={offset}
            picked={picked}
            onPick={(n) => performanceId && setPick({ id: performanceId, n })}
            onLockIn={lockIn}
            focusLockedRef={focusLockedRef}
            fade={fade}
          />
        </m.div>
      </AnimatePresence>
    </>
  );
}

type ScreenProps = {
  view: View;
  offset: number;
  picked: number | null;
  onPick(n: number): void;
  onLockIn(): void;
  focusLockedRef: React.RefObject<boolean>;
  fade: { duration: number };
};

function Screen({ view, offset, picked, onPick, onLockIn, focusLockedRef, fade }: ScreenProps) {
  const scoreTitle = useId();
  switch (view.kind) {
    case "idle":
      return <Message icon={HourglassMedium} title={c.startsSoon} body={c.idleBody} />;
    case "completed":
      return <Message icon={HourglassMedium} title={c.completed} body={c.idleBody} />;
    case "winner":
      return (
        <div className="flex flex-col gap-3 rounded-[20px] border border-yellow bg-yellow/10 p-6">
          <p className="flex items-center gap-2 text-[17px] font-medium text-yellow-hi">
            <Trophy aria-hidden="true" weight="regular" className="size-6 shrink-0" />
            {view.names.length > 1 ? c.winnersTitle : c.winnerTitle}
          </p>
          <h2 className="display break-words text-[36px] font-semibold leading-[1.1]">{view.names.join(" and ")}</h2>
          <p className="font-mono text-[20px] tabular-nums text-yellow-hi">{c.winnerScore(view.audience)}</p>
        </div>
      );
    case "ready":
      return <ActCard act={view.act} status={c.upNext} />;
    case "performing":
      return <ActCard act={view.act} status={c.onStageNow} clock={view.endsAtMs !== null ? { endsAtMs: view.endsAtMs, offset } : undefined} />;
    case "performed":
      return (
        <>
          <ActCard act={view.act} />
          <p className="text-[17px] font-medium text-text">{c.performed}</p>
        </>
      );
    case "voting-grid":
      return (
        <>
          <ActCard act={view.act} compact />
          <div className="flex flex-col gap-3 [@media(max-height:700px)]:gap-2">
            {view.notCounted && <p className="text-[15px] text-red-hi [@media(max-height:700px)]:text-[14px] [@media(max-height:700px)]:leading-[1.3]">{c.earlierNotCounted}</p>}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 id={scoreTitle} className="text-[17px] font-semibold text-text [@media(max-height:700px)]:leading-tight">
                {c.votingTitle}
              </h3>
              <TallyLine tally={view.tally} />
            </div>
            <ScoreGrid value={picked} onChange={onPick} labelledBy={scoreTitle} />
          </div>
          {/* Pinned: sticks to the bottom of the viewport while the page is taller than the screen, sits under the grid otherwise. */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-hair bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 [@media(max-height:700px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] [@media(max-height:700px)]:pt-2">
            <button
              type="button"
              onClick={onLockIn}
              disabled={picked === null}
              className={cn(
                "inline-flex h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-pill! px-6 text-[17px] font-semibold transition-colors duration-200",
                picked === null ? "cursor-not-allowed border border-hair bg-white/5 text-muted" : "cursor-pointer bg-yellow text-[#0a0a0c] hover:bg-yellow-hi",
              )}
            >
              {picked === null ? c.pickScore : c.lockIn(picked)}
            </button>
          </div>
        </>
      );
    case "voted":
      return (
        <>
          <ActCard act={view.act} />
          <VoteBlock vote={view.vote} focusLockedRef={focusLockedRef} fade={fade} />
          <SoFar tally={view.tally} label={c.audienceSoFar} />
        </>
      );
    case "paused":
      return (
        <>
          <ActCard act={view.act} />
          <Message icon={PauseCircle} title={c.votePaused} body={c.pausedBody} />
          {/* A queued vote's own line would repeat the heading, so it is left off. */}
          {view.vote && <VoteBlock vote={view.vote} hideLine={view.vote.line === "votePaused"} fade={fade} />}
        </>
      );
    case "closed":
      return (
        <>
          <ActCard act={view.act} />
          <Message icon={LockSimple} title={c.votingClosed} />
          {view.vote && <VoteBlock vote={view.vote} fade={fade} />}
          <SoFar tally={view.tally} label={c.audience} closed />
        </>
      );
    case "reveal": {
      const { audience, verdict } = revealLines(view);
      return (
        <>
          <ActCard act={view.act} />
          <dl className={cn("grid gap-3", audience ? "grid-cols-2" : "grid-cols-1")}>
            <Figure label={c.ownScore} value={view.self} />
            {audience && view.audience !== null && <Figure label={c.audience} value={view.audience} />}
          </dl>
          {verdict && <p className="text-[17px] font-medium text-text">{verdict}</p>}
        </>
      );
    }
  }
}

/** One big whole number out of ten, for the reveal's side-by-side pair. */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass flex flex-col gap-2 rounded-[20px] p-5">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="flex items-baseline gap-1 font-mono tabular-nums">
        <span className="text-[56px] font-medium leading-none">{value}</span>
        <span className="text-[17px] text-muted">{c.outOf}</span>
      </dd>
    </div>
  );
}

/** A clear single message for a screen with nothing to do: waiting, between acts, paused, closed. */
function Message({ icon: Icon, title, body }: { icon: typeof HourglassMedium; title: string; body?: string }) {
  return (
    <div className="glass flex flex-col gap-3 rounded-[20px] p-6">
      <Icon aria-hidden="true" weight="regular" className="size-8 text-muted" />
      <h2 className="display text-[28px] font-semibold leading-[1.15]">{title}</h2>
      {body && <p className="text-[17px] leading-snug text-muted">{body}</p>}
    </div>
  );
}

/**
 * "Audience so far" (or "Audience" once voting closed): the live whole-number
 * average big, the vote count beside it. The number follows tally.showAverage
 * (DGL.showLiveAverage); until there is one it says "Waiting for audience..."
 * (or "No votes" once closed). Never in the live region: it changes every poll.
 */
function SoFar({ tally, label, closed = false }: { tally: Tally; label: string; closed?: boolean }) {
  const so = audienceSoFar(tally, closed);
  if (!so) return null;
  return (
    <div className="glass flex items-end justify-between gap-4 rounded-[20px] p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] text-muted">{label}</p>
        {so.average !== null ? (
          <p className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-[44px] font-medium leading-none">{so.average}</span>
            <span className="text-[17px] text-muted">{c.outOf}</span>
          </p>
        ) : (
          <p className="text-[17px] leading-snug text-muted">{so.empty}</p>
        )}
      </div>
      <p className="shrink-0 font-mono text-[15px] tabular-nums text-muted">{c.voteCount(tally.votes)}</p>
    </div>
  );
}

function TallyLine({ tally, closed = false }: { tally: Tally; closed?: boolean }) {
  const average = tallyAverage(tally, closed);
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[14px] tabular-nums text-muted">
      <span>{c.voteCount(tally.votes)}</span>
      {average && <span>{average}</span>}
    </p>
  );
}

type VoteBlockProps = {
  vote: VoteShown;
  fade: { duration: number };
  hideLine?: boolean;
  /** When set, the block takes focus once on mount (the voter just locked in from the keyboard or a tap). */
  focusLockedRef?: React.RefObject<boolean>;
};

function VoteBlock({ vote, fade, hideLine = false, focusLockedRef }: VoteBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusLockedRef?.current) {
      focusLockedRef.current = false;
      ref.current?.focus();
    }
  }, [focusLockedRef]);
  const Icon = LINE_ICON[vote.line];
  const reduce = useReducedMotion();

  return (
    // A short settle when the card appears (only the transition honours reduced motion; the target is the same).
    <m.div
      ref={ref}
      tabIndex={-1}
      initial={{ scale: 0.96 }}
      animate={{ scale: 1 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 26 }}
      className="glass flex flex-col gap-2 rounded-[20px]! p-5 outline-offset-4"
    >
      <p className="text-[15px] text-muted">{c.yourScore}</p>
      <p className="font-mono text-[88px] font-medium leading-none tabular-nums">{vote.score}</p>
      {!hideLine && (
        <AnimatePresence initial={false} mode="wait">
          <m.p
            key={vote.line}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className={cn("flex items-start gap-2 text-[17px] font-medium leading-snug", LINE_TONE[vote.line])}
          >
            <Icon aria-hidden="true" weight="regular" className="mt-px size-6 shrink-0" />
            {c[vote.line]}
          </m.p>
        </AnimatePresence>
      )}
    </m.div>
  );
}
