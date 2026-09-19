"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MotionValue } from "motion/react";
import { buildField, drawField, type Field } from "@/components/brand/spectrum-field";

/**
 * The loader's canvas: the shelf of light around the mark. It reads `shown`
 * every frame and lets `spectrum-field.ts` build the picture from it; during
 * the cut it keeps the seconds since the cut so the field can rush past the
 * camera and dissolve, and it stops itself once the field has gone.
 */
export function SpectrumField({ shown, cutting, lockupRef }: { shown: MotionValue<number>; cutting: boolean; lockupRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cuttingRef = useRef(false);
  useEffect(() => {
    cuttingRef.current = cutting;
  }, [cutting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let field: Field | null = null;
    const resize = () => {
      w = canvas.width = canvas.clientWidth;
      h = canvas.height = canvas.clientHeight;
      const r = lockupRef.current?.getBoundingClientRect();
      if (r && r.width) field = buildField(w, h, { left: r.left, top: r.top, width: r.width });
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let cutAt = -1;
    const frame = (now: number) => {
      const cut = cuttingRef.current;
      if (cut && cutAt < 0) cutAt = now;
      const since = cut ? (now - cutAt) / 1000 : -1;
      if (field) drawField(ctx, w, h, field, { p: shown.get(), since, t: now / 1000 });
      if (since < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shown, lockupRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
