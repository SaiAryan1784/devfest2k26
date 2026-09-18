"use client";

import Image from "next/image";
import { useId, useMemo, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import type { TrackColor } from "@/data/event";
import { GLOW, N, SLAB, W, H, slabGeometry } from "./slabs";
import { cn } from "@/lib/utils";

/**
 * Procedural version of the Figma "glass slab" exports. Seven overlapping slabs
 * with an S-bend; each slab is a stroked path drawn as: cast shadow, gradient body
 * with a hot band, right-half shade, moving sheen, specular edge. A blurred copy
 * behind everything supplies bloom. See docs/reference/glimpse-v2.html and
 * `slabs.ts` (the geometry this component and the poster generator share).
 *
 * `poster` (default true) renders the pre-rasterised WebP from `npm run slabs`
 * instead of the live filtered SVG below. A Track panel used to mount two live
 * SVGs, each with about fifteen blur-filter regions; scaling the whole card
 * (the Tracks stack does this on scroll) forced the browser to re-run every
 * one of those filters on every frame, which was the stacking section's main
 * jank. The poster is a plain <img>: scaling it costs nothing. `poster={false}`
 * keeps the live, animatable version for the (currently unused) sheen.
 */

type Props = {
  side: "left" | "right";
  color: TrackColor;
  /** 0..1, scales bloom and glow. Default 1. */
  intensity?: number;
  /** Static blurred copy behind the slabs. Rasterised once; cheap after first paint. */
  bloom?: boolean;
  /** Moving highlight inside the live SVG. Only available when `poster` is false: keep it to one or two live instances per view. */
  sheen?: boolean;
  /**
   * Light travelling down the poster plus a slow breath on the bloom. Pure
   * transform/opacity CSS keyframes over the static image, so unlike `sheen`
   * this is safe to leave on for every card on screen.
   */
  alive?: boolean;
  /** Pre-rasterised poster (default) instead of a live filtered SVG. */
  poster?: boolean;
  className?: string;
};

export function GlassSlabs({ side, color, intensity = 1, bloom = true, sheen = false, alive = false, poster = true, className }: Props) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const dir = side === "left" ? 1 : -1;
  const showSheen = sheen && !reduce;

  const slabs = useMemo(() => slabGeometry(side, color), [side, color]);
  const glow = color === "spectrum" ? "#7ad38f" : GLOW[color];

  const wrapperStyle: CSSProperties = {
    ["--glow" as string]: glow,
    ["--gx" as string]: side === "left" ? "25%" : "75%",
    // Soft inner edge whatever the crop; the poster's own baked-in fade (or
    // the live SVG's fade rect) only covers the uncropped case.
    maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 55%, transparent 100%)`,
    WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 55%, transparent 100%)`,
  };

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute -top-[10%] -bottom-[10%] w-[34%]", side === "left" ? "left-0" : "right-0", className)}
      style={wrapperStyle}
    >
      {/* Cheap CSS bloom beyond the SVG bounds. The breath is an opacity
          keyframe on an inner layer so it multiplies with the intensity set
          here rather than replacing it; the blur itself runs once. */}
      <div className="absolute -inset-y-[20%] -inset-x-[30%]" style={{ opacity: 0.55 * intensity }}>
        <div
          className={cn("absolute inset-0", alive && "slab-breathe")}
          style={{
            background: `radial-gradient(60% 55% at var(--gx) 45%, var(--glow) 0%, transparent 70%)`,
            filter: "blur(30px)",
          }}
        />
      </div>

      {poster ? (
        <>
          <Image
            src={`/brand/slabs/${color}-${side}.webp`}
            alt=""
            fill
            sizes="40vw"
            className="relative block object-cover"
            style={{ objectPosition: side === "left" ? "0% 50%" : "100% 50%" }}
          />
          {alive && (
            // A band of light running down the slabs. Transform only, over a
            // static image, masked to the lit edge so it reads as light in the
            // glass rather than a stripe across the card.
            <span
              className="slab-travel absolute inset-x-0 top-0 block h-[45%]"
              style={{
                background: `linear-gradient(to bottom, transparent, ${glow}38 45%, ${glow}55 55%, transparent)`,
                mixBlendMode: "screen",
                maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 35%, transparent 85%)`,
                WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 35%, transparent 85%)`,
              }}
            />
          )}
        </>
      ) : (
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
      )}
    </div>
  );
}
