"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useAccent, useAccentCycle } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";
import { BEAM_REST, DUST, FAN_FOLLOW, HERO_DIM, IN_REST, NARROW, OUT_REST, SPREAD_REST, bench, createDust, drawField, pointerAngle, restBeams, smooth, type Dust, type Rect } from "./prism-field";

type Box = { rect: Rect; w: number; h: number; narrow: boolean; dust: Dust[]; heroLeft: number; heroTop: number; fine: boolean; held: boolean };

/**
 * The hero's background: the same optical bench the loader built, now behind
 * the copy and dimmer. One white beam into the `{`, four colours out of the
 * `}`, dust in the light, drawn by `prism-field.ts` on a transparent canvas.
 *
 * Behaviour, each with a reason: the loop starts on `landed`, with its first
 * frame drawn in the loader's unmount commit, so the hand-off is a swap between
 * identical pictures (continuity); on a fine pointer the beam swings toward the
 * cursor through a heavy spring and the fan follows, opening wider as the
 * cursor nears the mark (you hold the light); the fan features whichever track
 * the page's accent names, one at a time (state); on scroll the bench dims and
 * lifts and the canvas parallaxes (depth); on phones the beam sways on its own
 * and a touch steers it without blocking the scroll. Reduced motion draws one
 * still and redraws it only when the accent changes.
 */
export function Prism({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const landed = useLoaderState((s) => s.landed);
  const accent = useAccent((s) => s.accent);
  const inView = useInView(heroRef, { amount: 0.05 });
  useAccentCycle(Boolean(landed && inView && !reduce));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useRef<Box>({ rect: { left: 0, top: 0, width: 1 }, w: 0, h: 0, narrow: false, dust: createDust(DUST.wide), heroLeft: 0, heroTop: 0, fine: false, held: false });

  // Continuous values as MotionValues, read by the loop; never React state.
  const target = useMotionValue(IN_REST.wide);
  const angle = useSpring(target, { stiffness: 50, damping: 16, mass: 1.2 });
  const near = useMotionValue(0);
  const nearS = useSpring(near, { stiffness: 60, damping: 18 });
  const b0 = useMotionValue(BEAM_REST);
  const b1 = useMotionValue(BEAM_REST);
  const b2 = useMotionValue(BEAM_REST);
  const b3 = useMotionValue(BEAM_REST);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -60]);

  // The fan features the accent's track: eased on the way, set at once under reduced motion.
  useEffect(() => {
    const rest = restBeams(accent);
    const beams = [b0, b1, b2, b3];
    if (reduce) {
      beams.forEach((b, i) => b.set(rest[i]));
      return;
    }
    const controls = beams.map((b, i) => animate(b, rest[i], { duration: 0.6, ease: "easeInOut" }));
    return () => controls.forEach((c) => c.stop());
  }, [accent, reduce, b0, b1, b2, b3]);

  const measure = () => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    const lockup = hero?.querySelector<HTMLElement>("[data-hero-lockup]");
    if (!canvas || !hero || !lockup) return;
    const b = box.current;
    b.w = canvas.width = hero.clientWidth;
    b.h = canvas.height = hero.clientHeight;
    const hb = hero.getBoundingClientRect();
    const lb = lockup.getBoundingClientRect();
    b.rect = { left: lb.left - hb.left, top: lb.top - hb.top, width: lb.width };
    b.heroLeft = hb.left;
    b.heroTop = hb.top + window.scrollY;
    const narrow = b.w < NARROW;
    if (narrow !== b.narrow || b.dust.length === 0) b.dust = createDust(narrow ? DUST.narrow : DUST.wide);
    b.narrow = narrow;
    if (!b.held && !b.fine) target.set(narrow ? IN_REST.narrow : IN_REST.wide);
  };

  const draw = (t: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    const b = box.current;
    if (!ctx || !b.w) return;
    const restIn = b.narrow ? IN_REST.narrow : IN_REST.wide;
    const restOut = b.narrow ? OUT_REST.narrow : OUT_REST.wide;
    // Phones: the beam sways on its own unless a touch is steering it.
    if (!b.fine && !b.held && !reduce) target.set(restIn + 5 * Math.sin((t * Math.PI * 2) / 9));
    const scroll = scrollYProgress.get();
    const a = angle.get();
    drawField(ctx, b.w, b.h, {
      rect: b.rect,
      p: 1,
      inAngle: a + 8 * scroll,
      outAngle: restOut + FAN_FOLLOW * (a - restIn),
      spread: SPREAD_REST + 10 * nearS.get(),
      beams: [b0.get(), b1.get(), b2.get(), b3.get()],
      dim: HERO_DIM * (1 - smooth(0, 0.7, scroll)),
      t: reduce ? 0 : t,
      dust: b.dust,
    });
  };

  // First frame in the same commit that unmounts the loader, so the swap is
  // between identical pictures; then a still on every resize.
  useLayoutEffect(() => {
    if (!landed) return;
    box.current.fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    measure();
    draw(performance.now() / 1000);
    const hero = heroRef.current;
    if (!hero) return;
    const ro = new ResizeObserver(() => {
      measure();
      draw(performance.now() / 1000);
    });
    ro.observe(hero);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, reduce, accent]);

  // The loop, only while the hero is on screen and motion is allowed.
  useEffect(() => {
    if (!landed || reduce || !inView) return;
    let raf = requestAnimationFrame(function frame(now) {
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, reduce, inView]);

  // The pointer is the light source. Touch steers too, without touching the scroll.
  useEffect(() => {
    if (!landed || reduce || !inView) return;
    const b = box.current;
    const rest = () => {
      b.held = false;
      target.set(b.narrow ? IN_REST.narrow : IN_REST.wide);
      near.set(0);
    };
    const onMove = (e: PointerEvent) => {
      const cx = e.clientX - b.heroLeft;
      const cy = e.clientY + window.scrollY - b.heroTop;
      const { E, mid } = bench(b.rect);
      target.set(pointerAngle(cx, cy, E));
      const d = Math.hypot(cx - mid[0], cy - mid[1]);
      const reach = 0.3 * b.w;
      near.set(Math.exp(-(d * d) / (2 * reach * reach)));
      if (e.pointerType === "touch") b.held = true;
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerType === "touch") rest();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    document.addEventListener("pointerleave", rest);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("pointerleave", rest);
      rest();
    };
  }, [landed, reduce, inView, target, near]);

  return <motion.canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full" style={{ y }} />;
}
