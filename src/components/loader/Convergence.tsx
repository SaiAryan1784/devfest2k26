"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MotionValue } from "motion/react";
import { BRACKET_L, BRACKET_R, CAPSULE, LOCKUP_VIEWBOX, LOCKUP_W, WORDMARK } from "@/components/brand/lockup-paths";
import { PAL } from "@/components/brand/slabs";

/** Matches --color-canvas; the canvas is opaque so the trail fade composites against it. */
const CANVAS = "#050505";
/** Left to right along the mark, the site's own spectrum order. */
const SPECTRUM = [PAL.blue, PAL.green, PAL.yellow, PAL.red];

/** The capsule as an outline path, so the streaks can trace it like the brackets. */
const capsulePath = () => {
  const { x, y, width: w, height: h, rx } = CAPSULE;
  const run = w - 2 * rx;
  const drop = h - 2 * rx;
  return `M${x + rx} ${y}h${run}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${drop}a${rx} ${rx} 0 0 1 -${rx} ${rx}h-${run}a${rx} ${rx} 0 0 1 -${rx} -${rx}v-${drop}a${rx} ${rx} 0 0 1 ${rx} -${rx}z`;
};
const OUTLINES = [BRACKET_L, BRACKET_R, ...WORDMARK, capsulePath()];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Streak = {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  speed: number;
  weight: number;
  seed: number;
  glow: string;
  core: string;
  /** Which outline this streak belongs to, and how far along it. */
  path: number;
  s: number;
  captured: boolean;
};

/**
 * Long-exposure light. A few hundred streaks in the four track colours flow
 * across the frame like night traffic, in two opposing lanes that bend with a
 * slow field. As `shown` climbs past a half they are pulled inward, with a
 * swirl that is strongest mid-pull, each toward its own point on the lockup's
 * outline; once there it runs along the outline, so the mark is traced in
 * light by the time the cut comes. Canvas 2D at device-pixel-ratio 1, additive
 * compositing, one translucent fill per frame for the trails: nothing here
 * touches layout, and the loop stops itself 0.8 s after the cut, once its
 * wrapper has faded.
 *
 * Every visit draws a different picture. Targets are sampled from the real
 * lockup geometry and mapped onto `targetRef`, the box the real lockup will
 * fade into, so the traced outline and the sharpened mark coincide.
 */
export function Convergence({
  shown,
  cutting,
  targetRef,
}: {
  shown: MotionValue<number>;
  cutting: boolean;
  targetRef: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cuttingRef = useRef(false);

  useEffect(() => {
    cuttingRef.current = cutting;
  }, [cutting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const paths = Array.from(svg.querySelectorAll("path"));
    const lens = paths.map((p) => p.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);

    let w = 0;
    let h = 0;
    let box = { left: 0, top: 0, width: 1 };
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      ctx.fillStyle = CANVAS;
      ctx.fillRect(0, 0, w, h);
      const r = targetRef.current?.getBoundingClientRect();
      if (r && r.width) box = { left: r.left, top: r.top, width: r.width };
    };
    resize();
    window.addEventListener("resize", resize);

    // Where a streak's outline point is on screen. The mark scales uniformly,
    // so both axes use the width ratio.
    const pointAt = (q: Streak): [number, number] => {
      const len = lens[q.path];
      const pt = paths[q.path].getPointAtLength(((q.s % len) + len) % len);
      const k = box.width / LOCKUP_W;
      return [box.left + pt.x * k, box.top + pt.y * k];
    };

    const count = w < 768 ? 170 : 340;
    const streaks: Streak[] = Array.from({ length: count }, (_, i) => {
      // Spread the streaks evenly along the whole outline.
      const u = ((i + 0.5) / count) * total;
      let acc = 0;
      let path = 0;
      while (path < paths.length - 1 && acc + lens[path] < u) {
        acc += lens[path];
        path += 1;
      }
      const s = u - acc;
      // Colour follows where on the mark the streak will land, left to right.
      const pt = paths[path].getPointAtLength(s);
      const pal = SPECTRUM[Math.min(3, Math.floor((pt.x / LOCKUP_W) * 4))];
      const x = Math.random() * w;
      const y = Math.random() * h;
      return {
        x,
        y,
        px: x,
        py: y,
        vx: 0,
        vy: 0,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: 2.0 + Math.random() * 2.2,
        weight: 1.5 + Math.random() * 1.9,
        seed: Math.random() * Math.PI * 2,
        glow: pal.mid,
        core: pal.hi,
        path,
        s,
        captured: false,
      };
    });

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let cutAt = -1;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 16.667, 2);
      last = now;
      time += dt * 0.016;
      const p = shown.get();
      // The pull owns more than half the hold, and eases in and out.
      const pull = smooth(0.4, 0.96, p);
      const cut = cuttingRef.current;
      if (cut && cutAt < 0) cutAt = now;
      const sinceCut = cut ? (now - cutAt) / 1000 : 0;

      // Trails: one translucent fill of canvas colour per frame. Longer as the
      // pull tightens, longest once the outline is being traced.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(5,5,5,${cut ? 0.05 : 0.13 - 0.06 * pull})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      const drift = (1 + 0.9 * p) * dt;
      const cx = w / 2;
      const cy = h / 2;

      for (const q of streaks) {
        q.px = q.x;
        q.py = q.y;
        if (cut) q.captured = true;

        if (q.captured) {
          q.s += (1.4 + 1.8 * p) * dt;
          const [nx, ny] = pointAt(q);
          const jump = Math.hypot(nx - q.x, ny - q.y);
          q.x = nx;
          q.y = ny;
          // Wrapped around the outline's end, or just snapped on: no chord.
          if (jump > 12) continue;
        } else {
          // Two opposing lanes bending with a slow field.
          const a =
            (q.dir === 1 ? 0 : Math.PI) +
            0.5 * Math.sin(q.y * 0.004 + time * 0.9 + q.seed) +
            0.28 * Math.sin(q.x * 0.003 - time * 0.6);
          let fx = Math.cos(a) * q.speed;
          let fy = Math.sin(a) * q.speed * 0.7;
          if (pull > 0) {
            const [tx, ty] = pointAt(q);
            const dx = tx - q.x;
            const dy = ty - q.y;
            const d = Math.hypot(dx, dy) || 1;
            // Toward the target, slowing as it nears, plus a swirl around the
            // centre that peaks mid-pull and dies away as the streaks settle.
            // Kept gentle on purpose: the turns should read as lazy arcs.
            const mag = Math.min(d * 0.18, 2.5 + 6 * pull);
            const swirl = pull * (1 - pull) * 3.2;
            const rx = q.x - cx;
            const ry = q.y - cy;
            const rd = Math.hypot(rx, ry) || 1;
            fx = fx * (1 - pull) + (dx / d) * mag + (-ry / rd) * swirl;
            fy = fy * (1 - pull) + (dy / d) * mag + (rx / rd) * swirl;
            if (pull > 0.8 && d < 6) q.captured = true;
          }
          q.vx += (fx - q.vx) * 0.085 * dt;
          q.vy += (fy - q.vy) * 0.085 * dt;
          q.x += q.vx * drift;
          q.y += q.vy * drift;
          // Free flow wraps at the edges, so the lanes never run dry.
          if (pull < 0.3) {
            if (q.x < -40) q.px = q.x = w + 40;
            else if (q.x > w + 40) q.px = q.x = -40;
            if (q.y < -40) q.py = q.y = h + 40;
            else if (q.y > h + 40) q.py = q.y = -40;
          }
        }

        // Soft glow under a bright core.
        ctx.strokeStyle = q.glow;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = q.weight * 3.6;
        ctx.beginPath();
        ctx.moveTo(q.px, q.py);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        ctx.strokeStyle = q.core;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = q.weight;
        ctx.beginPath();
        ctx.moveTo(q.px, q.py);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!(cut && sinceCut > 0.8)) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shown, targetRef]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Geometry only: sampled for target points, never painted. Sized to zero rather than display:none so path lengths still resolve. */}
      <svg ref={svgRef} viewBox={LOCKUP_VIEWBOX} className="absolute h-0 w-0 overflow-hidden" style={{ visibility: "hidden" }}>
        {OUTLINES.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </>
  );
}
