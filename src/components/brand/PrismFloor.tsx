"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const Prism = dynamic(() => import("@/components/reactbits/Prism"), { ssr: false });

/**
 * Faint WebGL prism glow under the hero copy. Desktop only, mounted a beat after
 * the hero is ready so shader compilation never competes with the first paint.
 * Unmounted under reduced motion.
 */
export function PrismFloor() {
  const reduce = useReducedMotion();
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
      className="pointer-events-none absolute inset-x-0 bottom-[-30%] -z-10 h-[70%] opacity-25 [mask-image:radial-gradient(60%_60%_at_50%_100%,#000,transparent)]"
    >
      <Prism
        animationType="hover"
        height={3}
        baseWidth={5}
        glow={0.8}
        noise={0}
        scale={3.2}
        hueShift={0}
        colorFrequency={1.2}
        hoverStrength={1.2}
        inertia={0.06}
        bloom={1}
        suspendWhenOffscreen
        timeScale={0.4}
      />
    </div>
  );
}
