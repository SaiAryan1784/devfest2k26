"use client";

import { useEffect, useState } from "react";

/**
 * Which section the reader is currently in, for the nav's active pill.
 *
 * One IntersectionObserver over the section wrappers, never a scroll listener
 * (see CLAUDE.md). The wrappers carry their ids from the first paint even
 * before LazyMount mounts their contents, so this works immediately. The
 * top band of the viewport is what counts as "current": the observer's root
 * margin pulls the bottom edge up so a section only becomes current once it
 * has actually reached the upper part of the screen.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        // Whichever observed section occupies the band most fully wins; none
        // in the band (the hero, the footer) clears the highlight.
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio >= bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        setActive(best);
      },
      { rootMargin: "-10% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return active;
}
