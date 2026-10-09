"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { PauseCircle } from "@phosphor-icons/react";
import { DGL, DGL_TRACKS, type Track } from "@/data/dgl";
import { bannerFor, screenKey, showsQr, stageView, type StageAct, type StageView as View } from "@/lib/dgl/stage-view";
import { useDglState } from "@/lib/dgl/use-dgl-state";
import { useSpinning } from "@/lib/dgl/use-spin";
import { cn } from "@/lib/utils";
import { ConnectionPill } from "./ConnectionPill";
import { IdleCursor } from "./IdleCursor";
import { PromptWheel } from "./PromptWheel";
import { Reveal } from "./Reveal";
import { StageBanner, StagePoster } from "./StageBanner";
import { StageTimer } from "./StageTimer";
import { Winner } from "./Winner";

const c = DGL.copy;

type Props = {
  /** The track this projector is for. */
  track: Track;
  /** The QR code as an SVG string, made on the server from our own URL (never user input). */
  qrSvg: string;
  /** The voting URL as people would type it, shown under the code. */
  voteUrl: string;
  /** The static lockup, rendered on the server and passed through. */
  lockup: React.ReactNode;
};

const GUTTER = "px-6 sm:px-10 lg:px-[3vw]";
/** How long the landed wheel stays up after the spin ends, before the screen moves on to the centred "up next". */
const WHEEL_HOLD_MS = 1200;

/**
 * True for WHEEL_HOLD_MS after a spin ends, so the landed wheel is seen
 * (and the prompt beside it) before the screen changes. Derived during render
 * from the spin flag turning off, so there is no frame of the next screen in
 * between; a new spin cancels it. Never under reduced motion: no wheel moves,
 * the prompt just appears. `useSpinning` is untouched (the phones read it).
 */
function useWheelHold(spinning: boolean, reduce: boolean): boolean {
  const [was, setWas] = useState(spinning);
  const [holding, setHolding] = useState(false);
  if (was !== spinning) {
    setWas(spinning);
    setHolding(was && !spinning && !reduce);
  }
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setHolding(false), WHEEL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [holding]);
  return holding;
}

/**
 * The projector screen for DevFest Got Latent. Polls the show and renders
 * one screen per phase; every decision comes from `stageView`
 * (src/lib/dgl/stage-view.ts, unit tested). Read from the back of a hall:
 * nothing smaller than 24 px except the connection pill and the URL line.
 *
 * Two looks, picked by `bannerFor`. While nothing is on (waiting, between
 * acts) the poster fills the screen with two lines of text on a dark fade and
 * no QR. Every other screen has the title strip across the top, the header
 * under it and the content below: centred for "up next" and the winner, two
 * columns at lg and up for the rest (the act on the left; the wheel, the
 * timer with the QR, the voting QR or the reveal on the right), one column
 * below. The left column cross-fades only when the act changes; the right one
 * when the screen does. Hydration: useDglState starts with no state, so the
 * server and the first client render are both the waiting poster.
 */
export function StageView({ track, qrSvg, voteUrl, lockup }: Props) {
  const { state, offset, connection } = useDglState(track);
  const spinning = useSpinning(state?.spunAtMs ?? null, offset);
  const view = stageView(state, spinning);
  const reduce = useReducedMotion();
  const holding = useWheelHold(spinning, !!reduce);
  const root = useRef<HTMLDivElement>(null);
  const fade = reduce ? { duration: 0 } : { duration: 0.35 };
  const header = <Header track={track} connection={connection} lockup={lockup} />;

  return (
    <div ref={root} className="relative min-h-[100dvh] overflow-x-clip">
      <IdleCursor target={root} />
      <AnimatePresence initial={false} mode="wait">
        {bannerFor(view) === "poster" ? (
          <m.div key="poster" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="relative flex min-h-[100dvh] flex-col overflow-hidden">
            <StagePoster />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-canvas/80 to-transparent" />
            <div className="relative z-10">{header}</div>
            <div className={cn("relative z-10 mt-auto bg-gradient-to-t from-canvas via-canvas/85 to-transparent pb-[5vh] pt-32 text-center", GUTTER)}>
              <h1 className="display text-[clamp(2.5rem,4.5vw,5.5rem)] font-semibold leading-[1.05]">{view.kind === "completed" ? c.completed : c.idleTitle}</h1>
              <p className="mx-auto mt-4 max-w-[40ch] text-[clamp(1.5rem,2vw,2.5rem)] leading-snug text-muted">{c.stageIdleBody}</p>
            </div>
          </m.div>
        ) : (
          <m.div key="strip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="flex min-h-[100dvh] flex-col">
            <StageBanner />
            <div className="relative z-10">{header}</div>
            <Body view={view} holding={holding} prompt={state?.prompt ?? null} spunAtMs={state?.spunAtMs ?? null} offset={offset} qrSvg={qrSvg} voteUrl={voteUrl} fade={fade} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ track, connection, lockup }: { track: Track; connection: React.ComponentProps<typeof ConnectionPill>["connection"]; lockup: React.ReactNode }) {
  return (
    <header className={cn("flex items-center justify-between gap-6 py-4 lg:py-5 short:py-2", GUTTER)}>
      <div className="flex items-center gap-5">
        {lockup}
        <p className="hidden text-[24px] font-medium text-muted sm:block">{DGL.name}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="glass-pill rounded-pill px-4 py-1.5 text-[clamp(1.25rem,1.6vw,1.75rem)] font-medium text-text">{DGL_TRACKS.find((t) => t.id === track)?.label}</span>
        <ConnectionPill connection={connection} />
      </div>
    </header>
  );
}

type BodyProps = { view: View; holding: boolean; prompt: string | null; spunAtMs: number | null; offset: number; qrSvg: string; voteUrl: string; fade: { duration: number } };

/** Everything under the banner and header. Up next and the winner are centred; the rest are two columns. */
function Body({ view, holding, prompt, spunAtMs, offset, qrSvg, voteUrl, fade }: BodyProps) {
  // The wheel stays up through the hold after it lands, with the prompt beside it.
  const wheel = view.kind === "ready" && (view.act.spinning || holding);
  const centred = view.kind === "winner" || (view.kind === "ready" && !wheel);
  // A re-spin (a new spunAtMs) is a new wheel; every other change of screen keeps the screen's own key.
  const rightKey = wheel ? `wheel:${spunAtMs}` : screenKey(view);
  const leftKey = view.kind === "idle" || view.kind === "completed" || view.kind === "winner" ? view.kind : `act:${view.id}`;

  return (
    <div className={cn("flex flex-1 flex-col justify-center py-6 lg:py-8 short:py-2", GUTTER)}>
      <AnimatePresence initial={false} mode="wait">
        {centred ? (
          <m.div key={`centre:${screenKey(view)}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="flex flex-col items-center">
            {view.kind === "winner" ? <Winner names={view.names} audience={view.audience} /> : view.kind === "ready" ? <UpNext act={view.act} /> : null}
          </m.div>
        ) : (
          /*
           * At lg the right track is fit-content(52%): it sizes to the wheel,
           * timer, QR or reveal, but never past 52% of the row, so nothing on
           * the right can squeeze the act. The gutters are in vw on purpose: the
           * timer is at most 19vw type (see StageTimer, which also caps it by
           * height), 0.48 W wide (four 0.6 em mono glyphs, a width it keeps even
           * when it reads "Time"), and with 3vw padding and a 4vw gap it leaves
           * the left column 0.42 W at every width up to 1440 (where the timer
           * stops growing).
           */
          <m.div key="columns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_fit-content(52%)] lg:gap-[4vw]">
            <AnimatePresence initial={false} mode="wait">
              <m.div key={leftKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="min-w-0">
                <Left view={view} />
              </m.div>
            </AnimatePresence>
            <AnimatePresence initial={false} mode="wait">
              <m.div key={rightKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="flex min-w-0 flex-col items-start lg:items-center">
                {wheel ? <PromptWheel prompt={prompt} spunAtMs={spunAtMs} offset={offset} /> : <Right view={view} offset={offset} qrSvg={qrSvg} voteUrl={voteUrl} />}
              </m.div>
            </AnimatePresence>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Up next": the name very large and centred, and the prompt under it once the wheel has landed. */
function UpNext({ act }: { act: StageAct }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="text-[clamp(1.75rem,2.6vw,3rem)] font-medium text-muted">{c.upNext}</p>
      {act.contestant && <h1 className="display line-clamp-3 max-w-[20ch] text-balance break-words text-[clamp(3.5rem,10vw,12rem)] font-semibold leading-[1.02]">{act.contestant}</h1>}
      {act.prompt && <p className="line-clamp-3 max-w-[32ch] text-balance break-words text-[clamp(1.75rem,3vw,3.5rem)] leading-[1.2] text-yellow-hi">{act.prompt}</p>}
    </div>
  );
}

/** One plain sentence-case line above the name: what the act is doing. */
function status(view: View): { text: string; tone: string } | null {
  switch (view.kind) {
    case "ready":
      return { text: c.upNext, tone: "text-muted" };
    case "clock":
      // Once time is up the timer itself says so; one "Time" on screen is enough.
      return view.running ? { text: c.onStageNow, tone: "text-muted" } : null;
    case "voting":
      return view.paused ? null : { text: c.stageVotingOpen, tone: "text-blue-hi" };
    case "closed":
      return { text: c.votingClosed, tone: "text-muted" };
    default:
      return null;
  }
}

function Left({ view }: { view: View }) {
  // Only act screens use the columns; the waiting, between-acts and winner screens have their own layouts.
  if (view.kind === "idle" || view.kind === "completed" || view.kind === "winner") return null;
  return <ActBlock act={view.act} status={status(view)} />;
}

/**
 * Who is on, and their prompt. Names and prompts can be 200 characters: the
 * name is clamped to three lines and the prompt to four (visually only), and
 * long unbroken words wrap instead of running off the side.
 */
function ActBlock({ act, status }: { act: StageAct; status: { text: string; tone: string } | null }) {
  return (
    <div className="flex flex-col gap-5">
      {status && <p className={cn("text-[clamp(1.5rem,2vw,2.25rem)] font-medium", status.tone)}>{status.text}</p>}
      {act.contestant && <h1 className="display line-clamp-3 break-words text-[clamp(3rem,6vw,7rem)] font-semibold leading-[1.02]">{act.contestant}</h1>}
      {act.spinning && <p className="text-[clamp(1.75rem,2.8vw,3.25rem)] leading-[1.2] text-yellow-hi">{c.spinning}</p>}
      {act.prompt && <p className="line-clamp-4 max-w-[30ch] break-words text-[clamp(1.75rem,2.8vw,3.25rem)] leading-[1.2] text-muted">{act.prompt}</p>}
    </div>
  );
}

type RightProps = { view: View; offset: number; qrSvg: string; voteUrl: string };

function Right({ view, offset, qrSvg, voteUrl }: RightProps) {
  if (view.kind === "reveal") return <Reveal {...view} />;
  if (view.kind === "closed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[clamp(1.5rem,2vw,2.25rem)] text-muted">{c.votingClosed}</p>
        <p className="font-mono text-[clamp(4rem,8vw,9rem)] font-medium leading-none tabular-nums">{c.voteCount(view.votes)}</p>
      </div>
    );
  }
  // The code and the URL line under it show only while the act is running or
  // voting is open. Waiting, up next and between acts have no QR (those
  // screens do not use this column at all).
  if (!showsQr(view)) return null;

  if (view.kind === "clock") {
    // Under the big timer, smaller than the voting code. `relative` lifts the
    // block above the timer's ring, which is absolutely positioned and would
    // otherwise paint over the code.
    return (
      <div className="flex flex-col items-start gap-3 lg:items-center">
        <StageTimer endsAtMs={view.endsAtMs} offset={offset} running={view.running} />
        <div className="relative flex flex-col items-start gap-3 lg:items-center">
          <Qr svg={qrSvg} className="size-[min(26vh,40vw)]" />
          <p className="display text-[clamp(1.5rem,2vw,2.25rem)] font-semibold leading-none text-text">{c.scanToVote}</p>
          <p className="font-mono text-[20px] text-muted">{voteUrl}</p>
        </div>
      </div>
    );
  }
  if (view.kind !== "voting") return null;

  return (
    <div className="flex flex-col items-start gap-4 lg:items-center lg:gap-5">
      <Qr svg={qrSvg} className="size-[min(36vh,80vw)]" />
      {view.paused ? (
        <p className="flex items-center gap-3 text-[clamp(1.75rem,3vw,3.5rem)] font-semibold text-yellow-hi">
          <PauseCircle aria-hidden="true" weight="regular" className="size-[1em] shrink-0" />
          {c.votePaused}
        </p>
      ) : (
        <p className="display text-[clamp(1.75rem,3vw,3.5rem)] font-semibold leading-none text-blue-hi">{c.voteNow}</p>
      )}
      <p className="font-mono text-[clamp(1.75rem,3vw,3.5rem)] font-medium leading-none tabular-nums">{c.voteCount(view.votes)}</p>
      <p className="font-mono text-[20px] text-muted">{voteUrl}</p>
    </div>
  );
}

/**
 * The code on a near-white plate with dark modules: a projector cannot show
 * true black, and some scanners refuse light-on-dark codes, so this is the
 * reliable way round. The SVG is our own (made on the server from EVENT.url);
 * it is hidden from assistive tech, and the URL line under it is its text alternative.
 */
function Qr({ svg, className }: { svg: string; className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 overflow-hidden rounded-panel bg-paper [&>svg]:block [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
