"use client";

import { motion, useReducedMotion } from "motion/react";
import GlareHover from "@/components/reactbits/GlareHover";
import { Container } from "@/components/ui/Container";
import { GALLERY } from "@/data/gallery";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * The gallery: nine tiles, exact bento fit (one 2x2 feature + eight regular
 * on a 4-column desktop grid, 12 units total, so nothing sits on an empty
 * cell; full-width feature + 8 single tiles on the 2-column tablet grid;
 * plain single column on mobile). Each tile gets a light-sheen sweep on
 * hover (`GlareHover`, matching the site's existing glass/light vocabulary
 * rather than a 3D-tilt gimmick), and its caption sits below the image,
 * never overlaid on it.
 */
export function Gallery() {
  const reduce = useReducedMotion();

  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          Last year, in glimpses.
        </h2>

        {/* auto-rows is the image's height alone; each figure is a column so
            the caption adds its own space below rather than overflowing into
            the row beneath it (a fixed row height cannot grow to fit content). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[180px]">
          {GALLERY.map((photo, i) => (
            <motion.figure
              key={photo.id}
              className={`flex flex-col ${photo.feature ? "sm:col-span-2 lg:col-span-2 lg:row-span-2" : ""}`}
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease }}
            >
              <GlareHover
                width="100%"
                height="100%"
                background="#0b0b0d"
                borderColor="rgb(255 255 255 / 0.09)"
                borderRadius="20px"
                glareColor="#ffffff"
                glareOpacity={0.25}
                glareAngle={-30}
                glareSize={200}
                transitionDuration={700}
                className="min-h-[160px] flex-1 !w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={photo.caption} loading="lazy" className="h-full w-full rounded-card object-cover" />
              </GlareHover>
              <figcaption className="label mt-3 shrink-0">{photo.caption}</figcaption>
            </motion.figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
