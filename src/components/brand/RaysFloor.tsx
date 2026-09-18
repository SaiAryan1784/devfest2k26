"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { GLOW } from "@/components/brand/slabs";
import { useAccent } from "@/lib/accent";

const LightRays = dynamic(() => import("@/components/reactbits/LightRays"), { ssr: false });

/**
 * Warm light rising from the hero floor, tinted with whichever track colour
 * is active. Desktop only, mounted a beat after the hero is ready so shader
 * compilation never competes with first paint. Unmounted under reduced
 * motion. Replaces the old WebGL `Prism` raymarcher (a 100-step shader run
 * at up to DPR 2, restarted by any `pointermove` on the page, on or off
 * screen), which was one of the site's biggest single sources of dropped
 * frames; `LightRays` is a cheaper shader, capped at DPR 1, and pauses
 * itself via its own IntersectionObserver.
 */
export function RaysFloor() {
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const [mount, setMount] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;
    const t = setTimeout(() => setMount(true), 1500);
    return () => clearTimeout(t);
  }, [reduce]);

  if (!mount) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-[-15%] -z-10 h-[70%] opacity-35 [mask-image:radial-gradient(60%_60%_at_50%_100%,#000,transparent)]"
    >
      <LightRays
        raysOrigin="bottom-center"
        raysColor={GLOW[accent]}
        raysSpeed={0.8}
        lightSpread={0.8}
        rayLength={1.2}
        followMouse
        mouseInfluence={0.15}
        noiseAmount={0.05}
        fadeDistance={1.1}
        saturation={1}
      />
    </div>
  );
}
