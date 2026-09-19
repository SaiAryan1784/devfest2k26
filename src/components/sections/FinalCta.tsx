"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import ClickSpark from "@/components/reactbits/ClickSpark";
import ShinyText from "@/components/reactbits/ShinyText";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";

// WebGL, client only, never under reduced motion.
const PrismaticBurst = dynamic(() => import("@/components/reactbits/PrismaticBurst"), { ssr: false });

export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.2 });

  return (
    <section ref={ref} className="relative isolate overflow-hidden py-32 md:py-44 lg:py-56">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {reduce ? (
          // Static fallback: the spectrum as a still gradient, dimmed.
          <div className="h-full w-full opacity-30" style={{ background: "linear-gradient(90deg, #4285F4, #33C6F5, #34A853, #FBBC04, #FF7A1A, #EA4335)" }} />
        ) : (
          <div className="h-full w-full opacity-90 [&>div]:h-full">
            <PrismaticBurst
              intensity={2.6}
              speed={0.35}
              animationType="rotate3d"
              colors={["#4285F4", "#34A853", "#FBBC04", "#EA4335"]}
              distort={1.2}
              rayCount={10}
              paused={!inView}
              mixBlendMode="screen"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-canvas via-transparent to-canvas" />
      </div>

      <div className="mx-auto max-w-[1440px] px-5 text-center md:px-10 lg:px-14">
        <motion.h2
          className="display mb-10 text-[clamp(2.6rem,7vw,7rem)] font-medium leading-none"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <ShinyText
            text="See you on October 10."
            color="#f5f5f7"
            shineColor="#ffffff"
            speed={4}
            spread={90}
            className="!inline"
            disabled={!inView}
          />
        </motion.h2>
        <ClickSpark sparkColor="#fff" sparkSize={12} sparkRadius={28} sparkCount={10} duration={500}>
          <Button href={EVENT.links.waitlist} className="h-14 px-8 text-base">
            {EVENT.cta.primary}
          </Button>
        </ClickSpark>
      </div>
    </section>
  );
}
