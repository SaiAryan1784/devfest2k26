"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Container } from "@/components/ui/Container";
import { FLOOR } from "@/data/floor";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Everything on the floor beyond the tracks. A catalogue grid of like items:
 * glyph tiles from the Figma sheet sit greyscale until hovered or focused.
 */
export function Floor() {
  const reduce = useReducedMotion();
  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          <em className="display-em">…and the floor.</em>
        </h2>
        <p className="mb-12 max-w-[52ch] text-[17px] leading-relaxed text-muted">
          Between sessions the floor is the programme: hack spaces, booths, a robot track, creators recording live, and community demos on open display all day.
        </p>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOOR.map((item, i) => (
            <motion.li
              key={item.id}
              className="group relative"
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: (i % 3) * 0.06, ease }}
            >
              <motion.article
                tabIndex={0}
                whileHover={reduce ? undefined : { y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="glass flex h-full flex-col gap-5 rounded-card p-6 outline-offset-4"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-card bg-canvas">
                  <Image
                    src={`/brand/glyphs/${item.glyph}.webp`}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                    className="object-cover grayscale-[.7] transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.03] group-hover:grayscale-0 group-focus-within:grayscale-0"
                  />
                  {item.isNew && (
                    <span className="label absolute left-4 top-4 rounded-pill bg-text px-3 py-1.5 !text-canvas">{item.kind}</span>
                  )}
                </div>
                <div>
                  {!item.isNew && <p className="label mb-2">{item.kind}</p>}
                  <h3 className="display mb-2 text-2xl font-semibold leading-tight">{item.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{item.description}</p>
                </div>
              </motion.article>
            </motion.li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
