"use client";

import { useId, useMemo } from "react";
import { useReducedMotion } from "motion/react";
import type { TrackColor } from "@/data/event";
import { cn } from "@/lib/utils";

/**
 * Procedural version of the Figma "glass slab" exports. Seven overlapping slabs
 * with an S-bend; each slab is a stroked path drawn as: cast shadow, gradient body
 * with a hot band, right-half shade, moving sheen, specular edge. A blurred copy
 * behind everything supplies bloom. See docs/reference/glimpse-v2.html.
 */

type Palette = { hot: string; hi: string; mid: string; lo: string };

const PAL: Record<Exclude<TrackColor, "spectrum">, Palette> = {
  blue: { hot: "#EAF2FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  red: { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
  yellow: { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  green: { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
};

// Outer to inner hue per slab for the spectrum set.
const SPECTRUM: Palette[] = [
  { hot: "#E6F4FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  { hot: "#E6FBFF", hi: "#7FE3FF", mid: "#33C6F5", lo: "#0B7FA8" },
  { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
  { hot: "#F7FFE0", hi: "#D9F27A", mid: "#B5E000", lo: "#6E8A00" },
  { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  { hot: "#FFEEDD", hi: "#FFB27A", mid: "#FF7A1A", lo: "#B24C00" },
  { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
];

export const GLOW: Record<TrackColor, string> = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC04",
  green: "#34A853",
  spectrum: "#34A853",
};

const W = 560;
const H = 1000;
const N = 7;
const SLAB = 52;
const STEP = 34;
const JOG = 52;

type Props = {
  side: "left" | "right";
  color: TrackColor;
  /** 0..1, scales bloom and glow. Default 1. */
  intensity?: number;
  /** Static blurred copy behind the slabs. Rasterised once; cheap after first paint. */
  bloom?: boolean;
  /** Moving highlight. Forces SVG repaints, so keep it to one or two instances per view. */
  sheen?: boolean;
  className?: string;
};

export function GlassSlabs({ side, color, intensity = 1, bloom = true, sheen = false, className }: Props) {
  const uid = useId().replace(/[:]/g, "");
  const reduce = useReducedMotion();
  const dir = side === "left" ? 1 : -1;
  const bendY = side === "left" ? 330 : 640;
  const showSheen = sheen && !reduce;

  const slabs = useMemo(() => {
    const clamp = (y: number) => Math.max(0, Math.min(1, y / H)).toFixed(3);
    return Array.from({ length: N }, (_, i) => {
      const p = color === "spectrum" ? SPECTRUM[side === "left" ? i : N - 1 - i] : PAL[color];
      const x = side === "left" ? 30 + i * STEP : W - 30 - i * STEP;
      const x2 = x + dir * JOG;
      const hotY = (side === "left" ? bendY + 260 : bendY - 220) + i * 38;
      return {
        i,
        p,
        d: `M${x} -40 V${bendY} C${x} ${bendY + 60} ${x2} ${bendY + 40} ${x2} ${bendY + 110} V${H + 40}`,
        stops: [
          [0, p.hi],
          [clamp(hotY - 320), p.mid],
          [clamp(hotY - 60), p.hot],
          [clamp(hotY + 60), p.hot],
          [clamp(hotY + 380), p.mid],
          [1, p.lo],
        ] as [string | number, string][],
      };
    });
  }, [color, side, dir, bendY]);

  const glow = color === "spectrum" ? "#7ad38f" : GLOW[color];

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute -top-[10%] -bottom-[10%] w-[34%]", side === "left" ? "left-0" : "right-0", className)}
      style={{
        ["--glow" as string]: glow,
        ["--gx" as string]: side === "left" ? "25%" : "75%",
        // Soft inner edge whatever the crop; the SVG's own fade only covers the uncropped case.
        maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 55%, transparent 100%)`,
        WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 55%, transparent 100%)`,
      }}
    >
      {/* Cheap CSS bloom beyond the SVG bounds. */}
      <div
        className="absolute -inset-y-[20%] -inset-x-[30%]"
        style={{
          background: `radial-gradient(60% 55% at var(--gx) 45%, var(--glow) 0%, transparent 70%)`,
          filter: "blur(30px)",
          opacity: 0.55 * intensity,
        }}
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio={side === "left" ? "xMinYMid slice" : "xMaxYMid slice"}
        fill="none"
        className="relative block h-full w-full"
      >
        <defs>
          <filter id={`bl${uid}`} x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={`bloom${uid}`} x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="30" />
          </filter>
          <linearGradient id={`hot${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".38" stopColor="#fff" stopOpacity=".5" />
            <stop offset=".7" stopColor="#fff" stopOpacity=".05" />
            <stop offset="1" stopColor="#fff" stopOpacity=".25" />
          </linearGradient>
          <linearGradient id={`fade${uid}`} x1={side === "left" ? 0 : 1} y1="0" x2={side === "left" ? 1 : 0} y2="0">
            <stop offset=".45" stopColor="#0b0b0d" stopOpacity="0" />
            <stop offset="1" stopColor="#0b0b0d" stopOpacity="1" />
          </linearGradient>
          {slabs.map(({ i, stops }) => (
            <linearGradient key={i} id={`g${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
              {stops.map(([o, c], k) => (
                <stop key={k} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          ))}
        </defs>

        {bloom && (
          <g filter={`url(#bloom${uid})`} opacity={0.8 * intensity}>
            {slabs.map(({ i, d }) => (
              <path key={i} d={d} stroke={`url(#g${uid}${i})`} strokeWidth={SLAB * 1.5} />
            ))}
          </g>
        )}

        {[...slabs].reverse().map(({ i, d }) => {
          const depth = i / (N - 1);
          return (
            <g key={i} opacity={(1 - depth * 0.42).toFixed(2)}>
              <path d={d} stroke="#000" strokeWidth="20" opacity=".9" transform={`translate(${dir * (SLAB / 2 + 7)} 0)`} filter={`url(#bl${uid})`} />
              <path d={d} stroke={`url(#g${uid}${i})`} strokeWidth={SLAB} />
              <path d={d} stroke="#000" strokeWidth={SLAB * 0.5} opacity=".5" transform={`translate(${dir * SLAB * 0.28} 0)`} filter={`url(#bl${uid})`} />
              {showSheen && (
                <path
                  d={d}
                  stroke={`url(#hot${uid})`}
                  strokeWidth={SLAB}
                  opacity=".3"
                  className="sheen"
                  style={{ animationDelay: `${(-i * 0.6).toFixed(1)}s` }}
                />
              )}
              <path d={d} stroke="#fff" strokeWidth="2" opacity=".9" transform={`translate(${-dir * (SLAB / 2 - 1)} 0)`} />
            </g>
          );
        })}

        <rect x="0" y="0" width={W} height={H} fill={`url(#fade${uid})`} />
      </svg>
    </div>
  );
}
