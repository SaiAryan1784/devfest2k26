"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MotionValue } from "motion/react";
import { DUST, GLIDE_EASE, HERO_DIM, IN_REST, NARROW, OUT_REST, SPREAD_REST, createDust, drawField, lerp, restBeams, smooth, type Beams, type Rect } from "@/components/brand/prism-field";
import { useAccent } from "@/lib/accent";
import { CUT_S, GLIDE_AT, GLIDE_S, type Flip } from "./cut";

/**
 * The loader's canvas: the bench at centre stage. It reads `shown` every frame
 * and lets `prism-field.ts` build the picture from it. During the cut it moves
 * its anchor along the mark's glide (same start, same FLIP, same ease, no
 * layout reads) and settles the beams and brightness to their hero levels, so
 * that at landing it is drawing exactly what the hero's canvas draws next.
 */
export function PrismField({ shown, cutting, flip, lockupRef }: { shown: MotionValue<number>; cutting: boolean; flip: Flip | null; lockupRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cuttingRef = useRef(false);
  const flipRef = useRef<Flip | null>(null);
  useEffect(() => {
    cuttingRef.current = cutting;
    flipRef.current = flip;
  }, [cutting, flip]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let narrow = false;
    let dust = createDust(DUST.wide);
    let rect: Rect = { left: 0, top: 0, width: 1 };
    const resize = () => {
      w = canvas.width = canvas.clientWidth;
      h = canvas.height = canvas.clientHeight;
      const n = w < NARROW;
      if (n !== narrow || dust.length === 0) dust = createDust(n ? DUST.narrow : DUST.wide);
      narrow = n;
      const r = lockupRef.current?.getBoundingClientRect();
      if (r && r.width) rect = { left: r.left, top: r.top, width: r.width };
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let cutAt = -1;
    let start: Rect | null = null;

    const frame = (now: number) => {
      const cut = cuttingRef.current;
      if (cut && cutAt < 0) {
        cutAt = now;
        start = rect;
      }
      const since = cut ? (now - cutAt) / 1000 : 0;
      const f = flipRef.current;
      let anchor = rect;
      if (cut && f && start) {
        const e = GLIDE_EASE((since - GLIDE_AT * CUT_S) / GLIDE_S);
        anchor = { left: start.left + f.x * e, top: start.top + f.y * e, width: start.width * (1 + (f.scale - 1) * e) };
      }
      // As the mark glides, the bench settles to the levels the hero keeps.
      const settle = cut ? smooth(GLIDE_AT * CUT_S, CUT_S, since) : 0;
      const rest = restBeams(useAccent.getState().accent);
      const beams = rest.map((r) => lerp(1, r, settle)) as Beams;
      drawField(ctx, w, h, {
        rect: anchor,
        p: shown.get(),
        inAngle: narrow ? IN_REST.narrow : IN_REST.wide,
        outAngle: narrow ? OUT_REST.narrow : OUT_REST.wide,
        spread: SPREAD_REST,
        beams,
        dim: lerp(1, HERO_DIM, settle),
        t: now / 1000,
        dust,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shown, lockupRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
