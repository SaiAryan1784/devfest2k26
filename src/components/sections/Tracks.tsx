"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import ScrollStack, { ScrollStackItem } from "@/components/reactbits/ScrollStack";
import { Container } from "@/components/ui/Container";
import { TRACKS } from "@/data/tracks";
import { TrackPanel } from "./TrackPanel";

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function Tracks() {
  const reduce = useReducedMotion();
  const desktop = useDesktop();
  const stack = desktop && !reduce;

  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          Pick your track. <em className="display-em">Or wander.</em>
        </h2>
      </Container>

      {stack ? (
        <Container>
          <ScrollStack useWindowScroll itemDistance={40} itemStackDistance={24} stackPosition="12%" scaleEndPosition="6%" baseScale={0.9} itemScale={0.025}>
            {TRACKS.map((t) => (
              <ScrollStackItem key={t.id}>
                <TrackPanel track={t} />
              </ScrollStackItem>
            ))}
          </ScrollStack>
        </Container>
      ) : (
        <Container className="flex flex-col gap-4">
          {TRACKS.map((t) => (
            <TrackPanel key={t.id} track={t} />
          ))}
        </Container>
      )}
    </section>
  );
}
