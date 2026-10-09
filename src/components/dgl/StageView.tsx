"use client";

import { useRef } from "react";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { PauseCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { screenKey, showsPoster, showsQr, stageView, type StageAct, type StageView as View } from "@/lib/dgl/stage-view";
import { useDglState } from "@/lib/dgl/use-dgl-state";
import { cn } from "@/lib/utils";
import { ConnectionPill } from "./ConnectionPill";
import { IdleCursor } from "./IdleCursor";
import { Reveal } from "./Reveal";
import { StageTimer } from "./StageTimer";

const c = DGL.copy;

type Props = {
  /** The QR code as an SVG string, made on the server from our own URL (never user input). */
  qrSvg: string;
  /** The voting URL as people would type it, shown under the code. */
  voteUrl: string;
  /** The static lockup, rendered on the server and passed through. */
  lockup: React.ReactNode;
};

/**
 * The projector screen for DevFest Got Latent. Polls the show and renders
 * one screen per phase; every decision comes from `stageView`
 * (src/lib/dgl/stage-view.ts, unit tested). Read from the back of a hall:
 * nothing smaller than 24 px except the connection pill and the URL line.
 *
 * Two columns at lg and up (the act on the left, the timer, QR or reveal on
 * the right), one column below so it also works on a laptop or a phone. The
 * left column cross-fades only when the act changes; the right one when the
 * screen does. Hydration: useDglState starts with no state, so the server and
 * the first client render are both the IDLE screen.
 */
export function StageView({ qrSvg, voteUrl, lockup }: Props) {
  const { state, offset, connection } = useDglState();
  const view = stageView(state);
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const fade = reduce ? { duration: 0 } : { duration: 0.35 };
  const actKey = view.kind === "idle" || view.kind === "completed" ? view.kind : `act:${view.id}`;

  return (
    <div ref={root} className="relative flex min-h-[100dvh] flex-col px-6 py-6 sm:px-10 lg:px-[3vw] lg:py-12">
      <IdleCursor target={root} />
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {lockup}
          <p className="hidden text-[24px] font-medium text-muted sm:block">{DGL.name}</p>
        </div>
        <ConnectionPill connection={connection} />
      </header>

      {/*
       * At lg the right track is fit-content(52%): it sizes to the timer, QR or
       * reveal, but never past 52% of the row, so nothing on the right can
       * squeeze the act. The gutters are in vw on purpose: the timer is at most
       * 20vw type (see StageTimer, which also caps it by height), 0.48 W wide
       * (four 0.6 em mono glyphs, a width it keeps even when it reads "Time"),
       * and with 3vw padding and a 4vw gap it leaves the left column 0.42 W,
       * 47% of the tracks, at every width up to 1440 (where the timer stops
       * growing).
       */}
      <div className="grid flex-1 grid-cols-1 content-center items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_fit-content(52%)] lg:gap-[4vw]">
        <AnimatePresence initial={false} mode="wait">
          <m.div key={actKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="min-w-0">
            <Left view={view} />
          </m.div>
        </AnimatePresence>
        <AnimatePresence initial={false} mode="wait">
          <m.div
            key={screenKey(view)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="flex min-w-0 flex-col items-start lg:items-center"
          >
            <Right view={view} offset={offset} qrSvg={qrSvg} voteUrl={voteUrl} />
          </m.div>
        </AnimatePresence>
      </div>
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
  // The artwork rides along on the waiting, up next, voting and between-acts
  // screens (showsPoster; the QR rule does not move it): big when the left
  // column is otherwise just a message (waiting, between acts), a shorter
  // banner above the act's name and prompt (up next, voting) so those never
  // get squeezed.
  const poster = showsPoster(view);
  const between = view.kind === "idle" || view.kind === "completed";
  return (
    <div className="flex flex-col gap-8">
      {poster && <Poster compact={!between} />}
      {view.kind === "idle" ? (
        <Message title={c.idleTitle} body={c.stageIdleBody} />
      ) : view.kind === "completed" ? (
        <Message title={c.completed} body={c.stageIdleBody} />
      ) : (
        <ActBlock act={view.act} status={status(view)} />
      )}
    </div>
  );
}

/**
 * The DevFest Got Latent artwork (public/brand/dgl/dgl-poster.webp, 1502 x 1047).
 * Height-capped so the name and prompt (and, while voting, the QR beside it)
 * always keep their room on a projector; the image scales down to fit its box,
 * never crops.
 */
function Poster({ compact }: { compact: boolean }) {
  return (
    <Image
      src="/brand/dgl/dgl-poster.webp"
      alt={c.posterAlt}
      width={1502}
      height={1047}
      priority
      sizes="(min-width: 1024px) 45vw, 100vw"
      className={cn("h-auto w-auto max-w-full rounded-panel border border-hair object-contain", compact ? "max-h-[24vh]" : "max-h-[38vh]")}
    />
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex max-w-[22ch] flex-col gap-6">
      <h1 className="display text-[clamp(3rem,6vw,7rem)] font-semibold leading-[1.02]">{title}</h1>
      <p className="max-w-[32ch] text-[clamp(1.5rem,2.2vw,2.5rem)] leading-snug text-muted">{body}</p>
    </div>
  );
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
  // voting is open. Waiting, up next and between acts have nothing on this side
  // for now (the stage layout is redesigned later), and no QR.
  if (!showsQr(view)) return null;

  if (view.kind === "clock") {
    // Under the big timer, smaller than the voting code. `relative` lifts the
    // block above the timer's ring, which is absolutely positioned and would
    // otherwise paint over the code.
    return (
      <div className="flex flex-col items-start gap-3 lg:items-center">
        <StageTimer endsAtMs={view.endsAtMs} offset={offset} running={view.running} />
        <div className="relative flex flex-col items-start gap-3 lg:items-center">
          <Qr svg={qrSvg} className="size-[min(28vh,40vw)]" />
          <p className="display text-[clamp(1.5rem,2vw,2.25rem)] font-semibold leading-none text-text">{c.scanToVote}</p>
          <p className="font-mono text-[20px] text-muted">{voteUrl}</p>
        </div>
      </div>
    );
  }
  if (view.kind !== "voting") return null;

  return (
    <div className="flex flex-col items-start gap-6 lg:items-center">
      <Qr svg={qrSvg} className="size-[min(40vh,80vw)]" />
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
