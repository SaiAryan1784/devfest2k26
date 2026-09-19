"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import type { TrackColor } from "@/data/event";
import { useAccent, useAccentCycle } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";
import { PAL, SPECTRUM, type Palette } from "./slabs";

const PITCH = 30;
const BAR = 20;
const JOG = 8;
const JOG_RUN = 40;
/** Bars per bundle and the dark glass between bundles, as in the exports. */
const PER = 5;
const BUNDLE_GAP = 56;
const BUNDLE_W = PER * PITCH + BUNDLE_GAP;
const BAND_H = 140;
/** Horizontal reach of the pointer's influence, in px, one standard deviation. */
const REACH = 170;
const EASE = [0.16, 1, 0.3, 1] as const;

type BarSpec = {
  i: number;
  p: Palette;
  left: number;
  /** Where the S-jog sits, as a fraction of the height. */
  jog: number;
  /** Where the hot band rests, as a fraction of the height. */
  band: number;
  /** Ignition delay, seconds from the hand-off, spreading from the centre. */
  delay: number;
  depth: number;
};

/**
 * Bundles of five bars across the width, each bundle one hue of the spectrum
 * from blue on the left to red on the right, with dark glass between bundles.
 * Inside a bundle the jog and the hot band staircase down bar by bar, the
 * way the exports do.
 */
function specs(width: number, height: number): BarSpec[] {
  const nb = Math.max(2, Math.round(width / BUNDLE_W));
  const offset = (width - (nb * BUNDLE_W - BUNDLE_GAP)) / 2;
  const clamp = (f: number) => Math.min(0.9, Math.max(0.12, f));
  const bars: BarSpec[] = [];
  for (let b = 0; b < nb; b += 1) {
    const hue = SPECTRUM[Math.round((b / Math.max(1, nb - 1)) * (SPECTRUM.length - 1))];
    const jogBase = height * (0.3 + 0.12 * Math.sin(b * 1.7));
    for (let k = 0; k < PER; k += 1) {
      bars.push({
        i: bars.length,
        p: hue,
        left: offset + b * BUNDLE_W + k * PITCH,
        jog: clamp((jogBase + k * 26) / height),
        band: clamp((jogBase + 200 + k * 52) / height),
        delay: 0,
        depth: b % 3,
      });
    }
  }
  const centre = (bars.length - 1) / 2;
  for (const bar of bars) bar.delay = Math.abs(bar.i - centre) * 0.035;
  return bars;
}

const tint = (accent: TrackColor) => (accent === "spectrum" ? null : PAL[accent]);

/**
 * The Figma glass bars rebuilt as a live wall behind the hero copy. Every bar
 * is DOM and gradients (no image, no filter): a body whose vertical gradient
 * peaks at that bar's hot band, a static S-jog cut with clip-path, a specular
 * edge and shade per segment, a pair of tint layers that crossfade to the
 * active track colour, and the hot band itself, a near-white core with a
 * coloured box-shadow bloom. Seven spectrum hues run left to right, so a wide
 * screen gets more bars per hue rather than a stretched picture.
 *
 * Behaviour, each with a reason: bars ignite outward from the centre on the
 * loader hand-off (the light continues from where the lockup lands); the hot
 * bands breathe on a CSS keyframe (the glass is alive); on a fine pointer the
 * bars near the cursor brighten and their light slides toward it (you touch
 * the light); the wall tints to the hovered or cycling track (state); and
 * three depths parallax on scroll. Transform and opacity only, throughout.
 */
export function LightWall({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const ready = useLoaderState((s) => s.done);
  const accent = useAccent((s) => s.accent);
  const inView = useInView(heroRef, { amount: 0.2 });
  useAccentCycle(Boolean(ready && inView && !reduce));

  // Bar count follows the width; the server and first client render agree on
  // a default and the measured count replaces it in an effect.
  const [size, setSize] = useState({ w: 1440, h: 900 });
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight * 1.12 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [heroRef]);
  const bars = useMemo(() => specs(size.w, size.h), [size.w, size.h]);

  // Tint pair: the hidden layer takes the new colour, then the two crossfade.
  // Adjusted during render when the accent changes (React's pattern for
  // state that follows a prop), so no effect and no extra commit.
  const [slots, setSlots] = useState<{ a: TrackColor; b: TrackColor; active: "a" | "b" }>({ a: "spectrum", b: "blue", active: "a" });
  if (slots[slots.active] !== accent) {
    const hidden = slots.active === "a" ? "b" : "a";
    setSlots({ ...slots, [hidden]: accent, active: hidden });
  }

  // Pointer, as motion values, only on a device with a hover-capable pointer
  // and only while the hero is on screen. Parked far away otherwise.
  const px = useMotionValue(-9999);
  const py = useMotionValue(0);
  useEffect(() => {
    if (reduce || !inView || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      px.set(-9999);
      return;
    }
    const onMove = (e: PointerEvent) => {
      px.set(e.clientX);
      py.set(e.clientY);
    };
    const onLeave = () => px.set(-9999);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [reduce, inView, px, py]);
  const sx = useSpring(px, { stiffness: 90, damping: 22 });
  const sy = useSpring(py, { stiffness: 90, damping: 22 });

  // Scroll parallax in three depths as the hero leaves.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const depthY = [
    useTransform(scrollYProgress, [0, 1], [0, -40]),
    useTransform(scrollYProgress, [0, 1], [0, -70]),
    useTransform(scrollYProgress, [0, 1], [0, -100]),
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-[6%] -z-10 h-[112%] overflow-hidden"
      style={{
        // Full at the edges, calm through the middle so the headline stands in front of one continuous object.
        maskImage: "linear-gradient(90deg, #000 0%, #000 16%, rgb(0 0 0 / 0.3) 38%, rgb(0 0 0 / 0.3) 62%, #000 84%, #000 100%)",
        WebkitMaskImage: "linear-gradient(90deg, #000 0%, #000 16%, rgb(0 0 0 / 0.3) 38%, rgb(0 0 0 / 0.3) 62%, #000 84%, #000 100%)",
      }}
    >
      {bars.map((b) => (
        <Bar
          key={b.i}
          spec={b}
          height={size.h}
          ready={ready}
          reduce={!!reduce}
          sx={sx}
          sy={sy}
          y={depthY[b.depth]}
          tintA={tint(slots.a)}
          tintB={tint(slots.b)}
          activeSlot={slots.active}
        />
      ))}
    </div>
  );
}

function Bar({
  spec,
  height,
  ready,
  reduce,
  sx,
  sy,
  y,
  tintA,
  tintB,
  activeSlot,
}: {
  spec: BarSpec;
  height: number;
  ready: boolean;
  reduce: boolean;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  y: MotionValue<number>;
  tintA: Palette | null;
  tintB: Palette | null;
  activeSlot: "a" | "b";
}) {
  const { i, p, left, jog, band, delay } = spec;
  const cx = left + BAR / 2;
  const jogPx = jog * height;
  const bandPx = band * height;
  const belowJog = band > jog;

  // How much the pointer is "on" this bar, 0..1, and what that does to its light.
  const g = useTransform(sx, (x) => Math.exp(-((x - cx) ** 2) / (2 * REACH * REACH)));
  const bandY = useTransform([g, sy], (v: number[]) => (v[1] - bandPx) * 0.45 * v[0]);
  const bandOpacity = useTransform(g, (v) => 0.72 + 0.28 * v);
  const bandScale = useTransform(g, (v) => 1 + 0.6 * v);

  const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
  const clip = `polygon(0 0, ${BAR}px 0, ${BAR}px calc(${pct(jog)} - ${JOG_RUN / 2}px), ${BAR + JOG}px calc(${pct(jog)} + ${JOG_RUN / 2}px), ${BAR + JOG}px 100%, ${JOG}px 100%, ${JOG}px calc(${pct(jog)} + ${JOG_RUN / 2}px), 0 calc(${pct(jog)} - ${JOG_RUN / 2}px))`;
  // Dark glass everywhere except a window of light around the band.
  const glass = (t: Palette) =>
    `linear-gradient(to bottom, ${t.lo}40 0%, ${t.lo}59 ${pct(band - 0.3)}, ${t.mid}d9 ${pct(band - 0.11)}, ${t.hi} ${pct(band)}, ${t.mid}d9 ${pct(band + 0.11)}, ${t.lo}59 ${pct(band + 0.3)}, ${t.lo}40 100%)`;
  const body = glass(p);
  const segment = "linear-gradient(90deg, rgb(255 255 255 / 0.4) 0, rgb(255 255 255 / 0.4) 1px, transparent 1px, transparent 55%, rgb(0 0 0 / 0.55) 100%)";
  const tintStyle = (t: Palette | null) => (t ? glass(t) : "none");

  return (
    <motion.div
      className="absolute top-0 h-full"
      style={{ left, width: BAR + JOG, clipPath: clip, y, originY: 1 }}
      initial={{ opacity: 0, scaleY: 0.6 }}
      animate={{ opacity: ready ? 1 : 0, scaleY: ready ? 1 : 0.6 }}
      transition={reduce ? { duration: 0 } : { duration: 0.9, delay, ease: EASE }}
    >
      <div className="absolute inset-0" style={{ background: body }} />
      {/* Tint pair, crossfading to the active track colour. */}
      <div className="absolute inset-0 transition-opacity duration-[1200ms] ease-in-out" style={{ background: tintStyle(tintA), opacity: tintA && activeSlot === "a" ? 1 : 0 }} />
      <div className="absolute inset-0 transition-opacity duration-[1200ms] ease-in-out" style={{ background: tintStyle(tintB), opacity: tintB && activeSlot === "b" ? 1 : 0 }} />
      {/* Specular edge and shade, one per segment either side of the jog. */}
      <div className="absolute left-0 top-0" style={{ width: BAR, height: `calc(${pct(jog)} - ${JOG_RUN / 2}px)`, background: segment }} />
      <div className="absolute bottom-0" style={{ left: JOG, width: BAR, height: `calc(100% - ${pct(jog)} - ${JOG_RUN / 2}px)`, background: segment }} />
      {/* The hot band: pointer pull on the outer element, the breath on the inner. */}
      <motion.div
        className="absolute"
        style={{ left: belowJog ? JOG : 0, width: BAR, height: BAND_H, top: bandPx - BAND_H / 2, y: bandY, opacity: bandOpacity, scaleY: bandScale }}
      >
        <div
          className="band-drift absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, transparent, ${p.hot} 40%, ${p.hot} 60%, transparent)`,
            boxShadow: `0 0 22px 4px ${p.hi}73`,
            animationDelay: `${(-i * 0.35).toFixed(2)}s`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}
