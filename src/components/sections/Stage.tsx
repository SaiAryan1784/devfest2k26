"use client";

import { useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { Spotlight, SpotlightFloor } from "@/components/brand/Spotlight";
import { Container } from "@/components/ui/Container";
import { SPEAKERS_2025 } from "@/data/speakers";

const ease = [0.16, 1, 0.3, 1] as const;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/**
 * Last year's speakers under a stage light. Hovering or focusing a card moves the
 * light to that card; leaving returns it to centre. Photos are TODO in data.
 */
export function Stage() {
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLUListElement>(null);
  const target = useMotionValue(0);
  const x = useSpring(target, { stiffness: 70, damping: 18, mass: 0.8 });

  const aim = (el: HTMLElement | null) => {
    if (reduce || !el || !gridRef.current) return;
    const g = gridRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    target.set(r.left + r.width / 2 - (g.left + g.width / 2));
  };
  const reset = () => target.set(0);

  return (
    <section className="relative isolate overflow-hidden pt-24 md:pt-32 lg:pt-40">
      <Spotlight x={x} />

      <Container className="relative">
        <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Last year&apos;s stage.</h2>
        <p className="label mb-16">2026 lineup announced soon</p>

        <ul
          ref={gridRef}
          onMouseLeave={reset}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) reset();
          }}
          className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4"
        >
          {SPEAKERS_2025.map((s, i) => (
            <motion.li
              key={s.name}
              className="min-w-[78%] shrink-0 snap-start sm:min-w-[46%] md:min-w-0"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: (i % 4) * 0.06, ease }}
            >
              <motion.div
                tabIndex={0}
                onMouseEnter={(e) => aim(e.currentTarget)}
                onFocus={(e) => aim(e.currentTarget)}
                whileHover={reduce ? undefined : { y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="glass flex min-h-[112px] items-center gap-4 rounded-card p-4 pr-5"
              >
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo} alt="" className="size-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="display grid size-16 shrink-0 place-items-center rounded-full bg-surface-2 text-lg font-semibold text-muted">
                    {initials(s.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{s.name}</p>
                  <p className="text-sm leading-snug text-muted">
                    {s.role}
                    {s.company ? `, ${s.company}` : ""}
                  </p>
                </div>
              </motion.div>
            </motion.li>
          ))}
        </ul>
      </Container>

      <SpotlightFloor x={x} />
    </section>
  );
}
