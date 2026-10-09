"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CheckCircle, HourglassMedium, PauseCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { liveText, revealLines, tallyAverage, viewFor, type Act, type AudienceView as View, type Tally, type VoteShown } from "@/lib/dgl/audience-view";
import { useDglState } from "@/lib/dgl/use-dgl-state";
import { useVote } from "@/lib/dgl/use-vote";
import { cn } from "@/lib/utils";
import { ActClock } from "./ActClock";
import { ConnectionPill } from "./ConnectionPill";
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
export function AudienceView() {
  const { state, offset, connection } = useDglState();
  const { local, submit, cookiesBlocked } = useVote(state);
  const view = viewFor(state, local, cookiesBlocked);
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
      <ConnectionPill connection={connection} className="absolute right-4 top-[18px]" />
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
          className={cn("mt-6 flex flex-1 flex-col gap-5", view.kind === "voting-grid" && "[@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:gap-2")}
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
      return <Message title={c.idleTitle} body={c.idleBody} />;
    case "completed":
      return <Message title={c.completed} body={c.idleBody} />;
    case "ready":
      return <ActBlock act={view.act} status={c.upNext} />;
    case "performing":
      return (
        <>
          <ActBlock act={view.act} status={c.onStageNow} />
          {view.endsAtMs !== null && <ActClock endsAtMs={view.endsAtMs} offset={offset} />}
        </>
      );
    case "performed":
      return (
        <>
          <ActBlock act={view.act} />
          <p className="text-[17px] font-medium text-text">{c.performed}</p>
        </>
      );
    case "voting-grid":
      return (
        <>
          <ActBlock act={view.act} compact />
          <div className="flex flex-col gap-3 [@media(max-height:700px)]:gap-2">
            {view.notCounted && <p className="text-[15px] text-red-hi [@media(max-height:700px)]:text-[14px] [@media(max-height:700px)]:leading-[1.3]">{c.earlierNotCounted}</p>}
            <h3 id={scoreTitle} className="text-[17px] font-semibold text-blue-hi [@media(max-height:700px)]:leading-tight">
              {c.votingTitle}
            </h3>
            <ScoreGrid value={picked} onChange={onPick} labelledBy={scoreTitle} />
            <TallyLine tally={view.tally} />
          </div>
          <button
            type="button"
            onClick={onLockIn}
            disabled={picked === null}
            className={cn(
              "inline-flex h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-pill! px-6 text-[15px] font-medium transition-colors duration-200",
              picked === null ? "cursor-not-allowed border border-hair bg-white/5 text-muted" : "cursor-pointer bg-text text-[#0a0a0c] hover:bg-white",
            )}
          >
            {picked === null ? c.pickScore : c.lockIn(picked)}
          </button>
        </>
      );
    case "voted":
      return (
        <>
          <ActBlock act={view.act} />
          <VoteBlock vote={view.vote} focusLockedRef={focusLockedRef} fade={fade} />
          <TallyLine tally={view.tally} />
        </>
      );
    case "paused":
      return (
        <>
          <ActBlock act={view.act} />
          <Message title={c.votePaused} body={c.pausedBody} />
          {/* A queued vote's own line would repeat the heading, so it is left off. */}
          {view.vote && <VoteBlock vote={view.vote} hideLine={view.vote.line === "votePaused"} fade={fade} />}
        </>
      );
    case "closed":
      return (
        <>
          <ActBlock act={view.act} />
          <Message title={c.votingClosed} />
          <TallyLine tally={view.tally} closed />
          {view.vote && <VoteBlock vote={view.vote} fade={fade} />}
        </>
      );
    case "reveal": {
      const { audience, verdict } = revealLines(view);
      return (
        <>
          <ActBlock act={view.act} />
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-[15px] text-muted">{c.ownScore}</dt>
              <dd className="font-mono text-[44px] font-medium leading-none tabular-nums">{view.self}</dd>
            </div>
            {audience && (
              <div className="flex flex-col gap-1">
                <dt className="text-[15px] text-muted">{c.audience}</dt>
                <dd className="font-mono text-[44px] font-medium leading-none tabular-nums">{audience}</dd>
              </div>
            )}
          </dl>
          <p className="text-[17px] font-medium text-text">{verdict}</p>
        </>
      );
    }
  }
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="display text-[26px] font-semibold leading-[1.15]">{title}</h2>
      {body && <p className="text-[17px] leading-snug text-muted">{body}</p>}
    </div>
  );
}

/** Who is on, and their prompt. `status` is a plain sentence-case line, not an eyebrow. */
/**
 * Who is on, and their prompt. `status` is a plain sentence-case line, not an eyebrow.
 * Names and prompts can be 200 characters: the name is clamped to two lines and
 * the prompt to three (visually only; a screen reader still reads all of it),
 * and long unbroken words wrap instead of running off the side. `compact` (the
 * voting grid) sets both smaller on short screens so "Lock in" stays above the fold.
 */
function ActBlock({ act, status, compact = false }: { act: Act; status?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {status && <p className="text-[15px] text-muted">{status}</p>}
      {act.contestant && (
        <h2 className={cn("display line-clamp-2 break-words text-[32px] font-semibold leading-[1.1]", compact && "[@media(max-height:700px)]:text-[24px]")}>
          {act.contestant}
        </h2>
      )}
      {act.prompt && (
        <p
          className={cn(
            "mt-1 line-clamp-3 break-words text-[17px] leading-snug text-muted",
            compact && "[@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:text-[15px] [@media(max-height:700px)]:leading-[1.3]",
          )}
        >
          {act.prompt}
        </p>
      )}
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

  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-2 rounded-card outline-offset-4">
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
            <Icon aria-hidden="true" weight="regular" className="mt-[3px] size-5 shrink-0" />
            {c[vote.line]}
          </m.p>
        </AnimatePresence>
      )}
    </div>
  );
}
