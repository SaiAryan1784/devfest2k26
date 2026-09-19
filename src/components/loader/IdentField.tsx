"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import { buildField, drawField, type Field } from "@/components/brand/ident-field";

/**
 * The loader's canvas: the ident's stripes. It reads `shown` every frame,
 * measures the stage's lockup once per layout so the stripes know which rows
 * of the mark to light, and lets `ident-field.ts` draw. During the cut it
 * keeps the seconds since the cut so the field can rush, and it stops itself
 * once the field has dissolved.
 */
export function IdentField({ shown, cutting }: { shown: MotionValue<number>; cutting: boolean }) {
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
      const el = document.querySelector<HTMLElement>("[data-loader-lockup]");
      const r = el?.getBoundingClientRect();
      const rect = r && r.width > 0 ? { left: r.left, top: r.top, width: r.width } : { left: w / 2, top: h / 2, width: 0 };
      field = buildField(w, h, rect);
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
      if (since < 1.2) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shown]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
