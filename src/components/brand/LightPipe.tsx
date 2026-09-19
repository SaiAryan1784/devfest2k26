"use client";

import { useId, type CSSProperties } from "react";
import type { TrackColor } from "@/data/event";
import { cn } from "@/lib/utils";
import { PIPES, type PipeShape } from "./pipes";
import { PAL } from "./slabs";

type Props = {
  shape: PipeShape;
  color: Exclude<TrackColor, "spectrum">;
  /** Parallel tubes in the bundle. The sheet's marks use three to five. */
  tubes?: number;
  /** A pulse of light travelling through the front tube. Keep it to one instance at a time. */
  run?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * A bundle of light tubes along one of the brand's pipe shapes, in one track
 * colour, at any size. No image, no filter: bloom is a wide low-opacity
 * stroke, shading and the specular edge are narrower strokes nudged off-axis,
 * and the copies are translated back to front so the bundle stacks the way
 * the Figma sheet's do. The gradient is userSpaceOnUse so it survives straight
 * strokes (see CLAUDE.md). `run` is the only paint-animated layer: one extra
 * dashed stroke whose offset the `pipe-run` keyframe advances.
 */
export function LightPipe({ shape, color, tubes = 3, run = false, className, style }: Props) {
  const id = useId().replace(/:/g, "");
  const d = PIPES[shape];
  const p = PAL[color];
  const copies = Array.from({ length: tubes }, (_, k) => tubes - 1 - k);

  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={cn("block overflow-visible", className)} style={style}>
      <defs>
        <linearGradient id={`pipe-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0" stopColor={p.hi} />
          <stop offset="0.5" stopColor={p.mid} />
          <stop offset="1" stopColor={p.lo} />
        </linearGradient>
      </defs>
      {copies.map((k) => (
        <g key={k} transform={`translate(${-4 * k} ${4 * k})`} opacity={1 - k * 0.22} strokeLinecap="round" strokeLinejoin="round">
          <path d={d} stroke={p.mid} strokeWidth={14} opacity={0.12} />
          <path d={d} stroke={`url(#pipe-${id})`} strokeWidth={9} />
          <path d={d} stroke={p.lo} strokeWidth={4} opacity={0.5} transform="translate(2 2)" />
          <path d={d} stroke="#fff" strokeWidth={1.2} opacity={0.8} transform="translate(-3 -3)" />
          {k === 0 && run && (
            <path d={d} pathLength={1} stroke={p.hot} strokeWidth={9} strokeDasharray="0.18 0.82" opacity={0.95} className="pipe-run" />
          )}
        </g>
      ))}
    </svg>
  );
}
