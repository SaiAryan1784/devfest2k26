"use client";

import { useEffect, useRef } from "react";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { DGL } from "@/data/dgl";
import { revealLines } from "@/lib/dgl/audience-view";
import { formatAverage } from "@/lib/dgl/score";
import type { StageView } from "@/lib/dgl/stage-view";
import { cn } from "@/lib/utils";

/*
 * The reveal, in order: the contestant's own score lands, then the audience
 * number counts up, then the verdict fades in. Seconds from mount.
 */
const SELF_S = 0;
const SELF_LAND_S = 0.5;
const COUNT_AT_S = 0.7;
const COUNT_S = 1.2;
const VERDICT_AT_S = COUNT_AT_S + COUNT_S + 0.25;
const VERDICT_S = 0.4;
const EASE = [0.16, 1, 0.3, 1] as const;

const c = DGL.copy;

type Props = Extract<StageView, { kind: "reveal" }>;

/**
 * You / Audience / verdict at REVEAL. Every value comes from the server's
 * reveal (no comparison is recomputed here); the words are the phone's own
 * `revealLines`, so the stage and the phones always say the same verdict.
 *
 * The count-up is a MotionValue (a continuous value), animated once per
 * performance: the ref remembers which performanceId has played, so a poll
 * that re-renders, or the reduced-motion preference settling after mount,
 * lands on the final number instead of replaying. Its intermediate text is
 * display only; at rest it is exactly formatAverage(audience). Under reduced
 * motion every transition (and every delay) is zero, with the same targets,
 * so the final screen is identical and appears at once.
 */
export function Reveal(props: Props) {
  const { id, self, audience } = props;
  const reduce = useReducedMotion();
  const lines = revealLines({ kind: "reveal", act: props.act, self, audience, result: props.result });
  const match = props.result.kind === "match";

  const count = useMotionValue(0);
  const countText = useTransform(count, (v) => formatAverage(v));
  const played = useRef<string | null>(null);

  useEffect(() => {
    if (audience === null) return;
    if (played.current === id) {
      count.set(audience);
      return;
    }
    played.current = id;
    let done = false;
    const controls = animate(count, audience, reduce ? { duration: 0 } : { duration: COUNT_S, delay: COUNT_AT_S, ease: EASE });
    void controls.then(() => {
      done = true;
    });
    return () => {
      controls.stop();
      // Stopped part way (a dev StrictMode re-run, or the preference settling): let the next run play it again.
      if (!done) played.current = null;
    };
  }, [id, audience, reduce, count]);

  const at = (delay: number, duration: number) => (reduce ? { duration: 0 } : { duration, delay, ease: EASE });

  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      <dl className="flex flex-wrap items-end gap-x-16 gap-y-8 lg:gap-x-24">
        <m.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={at(SELF_S, SELF_LAND_S)} className="flex flex-col gap-3">
          <dt className="text-[clamp(1.5rem,2vw,2.25rem)] text-muted">{c.stageYou}</dt>
          <dd className="font-mono text-[clamp(6rem,11vw,12rem)] font-medium leading-none tabular-nums">{self}</dd>
        </m.div>
        {audience !== null && (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={at(COUNT_AT_S, 0.2)} className="flex flex-col gap-3">
            <dt className="text-[clamp(1.5rem,2vw,2.25rem)] text-muted">{c.audience}</dt>
            <dd className="flex items-baseline gap-4 font-mono font-medium leading-none tabular-nums">
              <m.span aria-hidden="true" className="text-[clamp(6rem,11vw,12rem)]">
                {countText}
              </m.span>
              <span aria-hidden="true" className="text-[clamp(1.5rem,2.5vw,3rem)] text-muted">
                {c.outOf}
              </span>
              {/* The animating figure is display only; a screen reader gets the settled one. */}
              <span className="sr-only">{lines.audience}</span>
            </dd>
          </m.div>
        )}
      </dl>
      <m.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={at(audience === null ? SELF_LAND_S : VERDICT_AT_S, VERDICT_S)}
        className={cn("display text-[clamp(2rem,4vw,4.5rem)] font-semibold leading-[1.05]", match ? "text-green-hi" : audience === null ? "text-muted" : "text-text")}
      >
        {lines.verdict}
      </m.p>
    </div>
  );
}
