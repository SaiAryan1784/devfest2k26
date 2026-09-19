"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import { drawField, layout, type Buffers, type Layout } from "@/components/brand/frost-field";

/**
 * The loader's canvas: the fog and the rods over the billboard's video. It
 * reads `shown` every frame, finds the hero's `<video>` once, and lets
 * `frost-field.ts` build the picture from the current frame. During the cut
 * it keeps the seconds since the cut so the rods can fly and the fog can
 * clear, and it stops itself once its wrapper has faded.
 */
export function FrostField({ shown, cutting }: { shown: MotionValue<number>; cutting: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cuttingRef = useRef(false);
  useEffect(() => {
    cuttingRef.current = cutting;
  }, [cutting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const video = document.querySelector<HTMLVideoElement>("[data-hero-video]");
    const bufs: Buffers = { coarse: document.createElement("canvas"), mid: document.createElement("canvas"), fine: document.createElement("canvas") };

    let w = 0;
    let h = 0;
    let lay: Layout | null = null;
    const resize = () => {
      w = canvas.width = canvas.clientWidth;
      h = canvas.height = canvas.clientHeight;
      for (const b of Object.values(bufs)) {
        b.width = w;
        b.height = h;
      }
      const readyAt = lay?.readyAt ?? -1;
      lay = layout(w, h);
      lay.readyAt = readyAt;
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let cutAt = -1;
    const frame = (now: number) => {
      const cut = cuttingRef.current;
      if (cut && cutAt < 0) cutAt = now;
      const since = cut ? (now - cutAt) / 1000 : -1;
      if (lay) drawField(ctx, w, h, video, bufs, lay, { p: shown.get(), since, t: now / 1000 });
      if (since < 1.7) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shown]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
