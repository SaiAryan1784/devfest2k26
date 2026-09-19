"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { EVENT } from "@/data/event";
import { useHeroView } from "@/lib/hero-view";
import { useLoaderState } from "@/lib/loader-state";

const NARROW = "(max-width: 767px)";

/**
 * The billboard's picture: the silent loop under two scrims, with its poster
 * painted beneath as a real image so the first paint (and the LCP) never
 * waits for video. The source is chosen on the client (720p on phones), so the
 * server markup carries no `src` and nothing can mismatch. It never loads
 * under reduced motion (the stylesheet hides the element too) or Save-Data,
 * plays only while at least half the hero is on screen (so it never decodes
 * under the scrolled nav or behind the tracks), and starts the moment the
 * loader commits to its sequence so the blinds have a picture to show.
 */
export function HeroVideo({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const showing = useLoaderState((s) => s.showing);
  const done = useLoaderState((s) => s.done);
  const inView = useInView(heroRef, { amount: 0.5 });
  const setHeroInView = useHeroView((s) => s.setInView);
  const ref = useRef<HTMLVideoElement>(null);
  const { video } = EVENT.hero;

  // The source is attached only after the fonts are in and the main thread is
  // idle, so the loop's megabytes never share the line with the headline's
  // font on a slow connection. The blinds draw dark glass until it is ready.
  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    let cancelled = false;
    let idle: number | undefined;
    let timer: number | undefined;
    const start = () => {
      if (cancelled) return;
      // HEVC where the browser decodes it in hardware (Safari, Chrome and Edge on Apple and on Windows with the codec), H.264 elsewhere.
      const hevc = v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0"') !== "";
      const narrow = window.matchMedia(NARROW).matches;
      const src = narrow ? (hevc ? video.mobileHevc : video.mobile) : hevc ? video.desktopHevc : video.desktop;
      if (v.getAttribute("src") !== src) {
        v.muted = true;
        v.src = src;
        v.load();
      }
    };
    const whenFonts = document.fonts?.ready ?? Promise.resolve();
    whenFonts.then(() => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 800 });
      else timer = window.setTimeout(start, 200);
    });
    return () => {
      cancelled = true;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [reduce, video]);

  useEffect(() => {
    setHeroInView(inView);
  }, [inView, setHeroInView]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (reduce || !inView || !(showing || done)) {
      v.pause();
      return;
    }
    v.muted = true;
    const p = v.play();
    if (p) p.catch(() => {});
  }, [reduce, inView, showing, done]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={video.poster}
        srcSet={`${video.posterMobile} 1280w, ${video.poster} 1920w`}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <video ref={ref} data-hero-video muted loop playsInline preload="auto" className="hero-video absolute inset-0 h-full w-full object-cover" />
      {/* Scrims: from the left on wide screens (the copy's column), from the bottom on phones, and a fade into the page below. */}
      <div
        className="absolute inset-0 hidden md:block"
        style={{ background: "linear-gradient(90deg, var(--color-canvas) 0%, rgb(5 5 5 / 0.9) 28%, rgb(5 5 5 / 0.6) 56%, rgb(5 5 5 / 0.22) 78%, rgb(5 5 5 / 0.1) 100%)" }}
      />
      <div
        className="absolute inset-0 md:hidden"
        style={{ background: "linear-gradient(to top, var(--color-canvas) 0%, rgb(5 5 5 / 0.82) 42%, rgb(5 5 5 / 0.3) 78%, rgb(5 5 5 / 0.2) 100%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[28%]" style={{ background: "linear-gradient(to top, var(--color-canvas), transparent)" }} />
    </div>
  );
}
