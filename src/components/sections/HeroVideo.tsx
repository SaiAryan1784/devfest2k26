"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { EVENT } from "@/data/event";
import { useLoaderState } from "@/lib/loader-state";

const NARROW = "(max-width: 767px)";

/**
 * The billboard's picture: the silent loop under two scrims, with its poster
 * painted beneath as a real image so the first paint (and the LCP) never
 * waits for video. The source is chosen on the client (720p on phones), so the
 * server markup carries no `src` and nothing can mismatch. It never loads
 * under reduced motion (the stylesheet hides the element too) or Save-Data,
 * plays only while the hero is on screen, and starts the moment the loader
 * commits to its sequence so it is already moving when the gate dissolves.
 */
export function HeroVideo({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const showing = useLoaderState((s) => s.showing);
  const done = useLoaderState((s) => s.done);
  const inView = useInView(heroRef, { amount: 0.1 });
  const ref = useRef<HTMLVideoElement>(null);
  const { video } = EVENT.hero;

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    const src = window.matchMedia(NARROW).matches ? video.mobile : video.desktop;
    if (v.getAttribute("src") !== src) {
      v.muted = true;
      v.src = src;
      v.load();
    }
  }, [reduce, video]);

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
